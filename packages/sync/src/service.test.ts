import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  test,
  vi,
} from "vitest";
import { openCache } from "./cache/open.js";
import { createSqliteRepository, type Repository } from "./cache/store.js";
import type { SyncCycleSummary, SyncEngine } from "./engine.js";
import { createSyncServiceFromDependencies } from "./service.js";

const emptySummary: SyncCycleSummary = {
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:00.000Z",
  durationMs: 0,
  results: [],
};

describe("SyncService", () => {
  let cacheRoot: string;
  let previousXdg: string | undefined;
  let repo: Repository;
  let closeDb: () => void;
  let engine: SyncEngine;
  let closeStorage: Mock<() => void>;
  let onBackgroundError: Mock<(error: unknown) => void>;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), "ghd-service-"));
    previousXdg = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = cacheRoot;

    const { db } = openCache();
    repo = createSqliteRepository(db);
    closeDb = () => db.close();
    engine = {
      runOnce: vi.fn(async () => emptySummary),
      start: vi.fn(),
      stop: vi.fn(async () => {}),
      isRunning: vi.fn(() => false),
    };
    closeStorage = vi.fn();
    onBackgroundError = vi.fn();
  });

  afterEach(() => {
    closeDb();
    if (previousXdg === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = previousXdg;
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  function createService() {
    return createSyncServiceFromDependencies({
      repo,
      engine,
      closeStorage,
      onBackgroundError,
    });
  }

  test("returns normalized read models instead of storage rows", () => {
    repo.upsertInstance({
      id: "github",
      label: "GitHub",
      baseUrl: "https://api.github.com",
      username: "alice",
    });
    repo.replaceNotifications("github", [
      {
        instance_id: "github",
        id: "7",
        title: "Mention",
        type: "Issue",
        reason: "mention",
        repo: "acme/widgets",
        url: "https://github.com/acme/widgets/issues/1",
        unread: 1,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(createService().listNotifications("github")).toEqual([
      {
        id: "7",
        title: "Mention",
        type: "Issue",
        reason: "mention",
        repo: "acme/widgets",
        url: "https://github.com/acme/widgets/issues/1",
        unread: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  test("delegates explicit sync and loop lifecycle to the engine", async () => {
    const service = createService();
    const request = { instanceId: "github", kind: "prs" as const };

    await expect(service.sync(request)).resolves.toBe(emptySummary);
    expect(engine.runOnce).toHaveBeenCalledWith({
      instance: "github",
      kind: "prs",
    });

    service.start({ intervalMs: 123 });
    expect(engine.start).toHaveBeenCalledWith({ intervalMs: 123 });

    await service.stop();
    expect(engine.stop).toHaveBeenCalledOnce();
  });

  test("contains failures from fire-and-forget sync requests", async () => {
    const error = new Error("config unavailable");
    vi.mocked(engine.runOnce).mockRejectedValueOnce(error);
    const service = createService();

    service.requestSync({ instanceId: "github" });
    await service.stop();

    expect(onBackgroundError).toHaveBeenCalledWith(error);
  });

  test("close waits for work, closes storage once, and rejects further use", async () => {
    let finish!: () => void;
    vi.mocked(engine.runOnce).mockReturnValueOnce(
      new Promise<SyncCycleSummary>((resolve) => {
        finish = () => resolve(emptySummary);
      }),
    );
    const service = createService();
    service.requestSync();

    const closing = service.close();
    expect(closeStorage).not.toHaveBeenCalled();
    finish();
    await closing;

    expect(closeStorage).toHaveBeenCalledOnce();
    await service.close();
    expect(closeStorage).toHaveBeenCalledOnce();
    expect(() => service.listNotifications("github")).toThrow(
      "SyncService is closed",
    );
  });

  test("close releases storage even when stopping the engine fails", async () => {
    vi.mocked(engine.stop).mockRejectedValueOnce(new Error("stop failed"));
    const service = createService();

    await expect(service.close()).rejects.toThrow("stop failed");
    expect(closeStorage).toHaveBeenCalledOnce();
  });
});
