import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openCache } from "./cache/open.js";
import { createSqliteRepository } from "./cache/store.js";
import type { GitHubInstance } from "./config.js";
import { createSyncEngine, reconcileInstances } from "./engine.js";

// These tests exercise the engine's lifecycle and DI surface without hitting
// the network. We inject loadInstances to return a fixed list, and avoid any
// real provider fetches by keeping the instance list empty (no targets to
// fetch) or by targeting an unknown instance, which throws before any fetch.

describe("createSyncEngine", () => {
  let cacheRoot: string;
  let prevXdg: string | undefined;
  let close: () => void;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), "ghd-engine-"));
    prevXdg = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = cacheRoot;
  });

  afterEach(() => {
    close?.();
    if (prevXdg === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = prevXdg;
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  function setupEngine(instances: GitHubInstance[] = []) {
    const { db } = openCache();
    close = () => db.close();
    const repo = createSqliteRepository(db);
    const engine = createSyncEngine({
      repo,
      loadInstances: async () => instances,
    });
    return { repo, engine };
  }

  test("runOnce with no instances returns an empty cycle", async () => {
    const { engine } = setupEngine([]);
    const summary = await engine.runOnce();
    expect(summary.results).toEqual([]);
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("runOnce reconciles instances before running providers", async () => {
    const { repo, engine } = setupEngine([
      {
        id: "a",
        label: "A",
        baseUrl: "https://api.github.com",
        token: "x",
        username: "u",
      },
    ]);
    // Targeting an unknown instance is rejected.
    await expect(engine.runOnce({ instance: "missing" })).rejects.toThrow(
      "unknown instance: missing",
    );
    // But the reconcile step still upserted the configured instance into the DB.
    expect(repo.listInstanceIds()).toEqual(["a"]);
  });

  test("start + stop lifecycle", async () => {
    const { engine } = setupEngine([]);
    expect(engine.isRunning()).toBe(false);

    let cycles = 0;
    engine.start({
      intervalMs: 10,
      onCycle: () => {
        cycles += 1;
      },
    });
    expect(engine.isRunning()).toBe(true);

    // Calling start while already running is a programmer error.
    expect(() => engine.start()).toThrow("already running");

    // Give the loop time to run at least one cycle.
    await new Promise((r) => setTimeout(r, 30));
    await engine.stop();
    expect(engine.isRunning()).toBe(false);
    expect(cycles).toBeGreaterThan(0);

    // stop() is idempotent.
    await engine.stop();
  });

  test("stop wakes the loop immediately from its sleep interval", async () => {
    const { engine } = setupEngine([]);
    engine.start({ intervalMs: 60_000 });
    // Let the first cycle finish, then trigger stop. If sleep weren't
    // interruptible, this test would time out waiting 60s.
    await new Promise((r) => setTimeout(r, 20));
    const stopStart = Date.now();
    await engine.stop();
    expect(Date.now() - stopStart).toBeLessThan(500);
  });

  test("reconcileInstances handles add + remove + label-edit", () => {
    const { repo } = setupEngine([]);
    reconcileInstances(repo, [
      {
        id: "a",
        label: "A",
        baseUrl: "https://api.github.com",
        token: "x",
        username: "u",
      },
      {
        id: "b",
        label: "B",
        baseUrl: "https://api.github.com",
        token: "x",
        username: "u",
      },
    ]);
    expect(repo.listInstanceIds()).toEqual(["a", "b"]);

    const { added, removed } = reconcileInstances(repo, [
      {
        id: "a",
        label: "A-renamed",
        baseUrl: "https://api.github.com",
        token: "x",
        username: "u",
      },
      {
        id: "c",
        label: "C",
        baseUrl: "https://api.github.com",
        token: "x",
        username: "u",
      },
    ]);
    expect(added).toEqual(["c"]);
    expect(removed).toEqual(["b"]);
    expect(repo.listInstances().find((i) => i.id === "a")?.label).toBe(
      "A-renamed",
    );
  });
});
