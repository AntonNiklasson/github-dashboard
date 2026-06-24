import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openCache } from "./open.js";
import { type PrRow, createSqliteRepository } from "./store.js";

function openTestRepo() {
  const { db, path } = openCache();
  return { repo: createSqliteRepository(db), path, close: () => db.close() };
}

describe("createSqliteRepository", () => {
  let cacheRoot: string;
  let prevXdg: string | undefined;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), "ghd-repo-"));
    prevXdg = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = cacheRoot;
  });

  afterEach(() => {
    if (prevXdg === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = prevXdg;
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  test("upsert + list + delete instance round-trips", () => {
    const { repo, close } = openTestRepo();
    try {
      repo.upsertInstance({
        id: "a",
        label: "A",
        baseUrl: "https://api.github.com",
        username: "u1",
      });
      repo.upsertInstance({
        id: "b",
        label: "B",
        baseUrl: "https://api.github.com",
        username: "u2",
      });
      expect(repo.listInstanceIds()).toEqual(["a", "b"]);

      repo.upsertInstance({
        id: "a",
        label: "A-renamed",
        baseUrl: "https://api.github.com",
        username: "u1",
      });
      expect(repo.listInstances().find((i) => i.id === "a")?.label).toBe(
        "A-renamed",
      );

      repo.deleteInstance("a");
      expect(repo.listInstanceIds()).toEqual(["b"]);
    } finally {
      close();
    }
  });

  test("deleting an instance cascades PRs and notifications", () => {
    const { repo, close } = openTestRepo();
    try {
      repo.upsertInstance({
        id: "x",
        label: "X",
        baseUrl: "https://api.github.com",
        username: "u",
      });
      const pr: PrRow = {
        instance_id: "x",
        kind: "authored",
        provider_ref: "PR_1",
        number: 1,
        repo: "o/r",
        title: "t",
        author: "u",
        draft: 0,
        ci_status: "success",
        in_merge_queue: 0,
        auto_merge: 0,
        unresolved_threads: 0,
        additions: 1,
        deletions: 0,
        commits: 1,
        comment_count: 0,
        mergeable: "MERGEABLE",
        updated_at: "2026-01-01T00:00:00Z",
        payload: '{"id":1,"number":1}',
      };
      repo.replacePrs("x", "authored", [pr]);
      repo.replaceNotifications("x", [
        {
          instance_id: "x",
          id: "n1",
          title: "hi",
          type: "PullRequest",
          reason: "mention",
          repo: "o/r",
          url: "https://github.com/o/r/pull/1",
          unread: 1,
          updated_at: "2026-01-01T00:00:00Z",
        },
      ]);
      expect(repo.countPrsByKind("x")).toEqual([
        { kind: "authored", count: 1 },
      ]);
      expect(repo.countNotifications("x")).toBe(1);
      expect(repo.listNotifications("x")[0]?.title).toBe("hi");

      repo.deleteInstance("x");
      expect(repo.countPrsByKind("x")).toEqual([]);
      expect(repo.countNotifications("x")).toBe(0);
      expect(repo.listNotifications("x")).toEqual([]);
    } finally {
      close();
    }
  });

  test("replacePrs is atomic — old rows replaced wholesale by new set", () => {
    const { repo, close } = openTestRepo();
    try {
      repo.upsertInstance({
        id: "x",
        label: "X",
        baseUrl: "https://api.github.com",
        username: "u",
      });
      const make = (n: number): PrRow => ({
        instance_id: "x",
        kind: "authored",
        provider_ref: `PR_${n}`,
        number: n,
        repo: "o/r",
        title: `pr ${n}`,
        author: "u",
        draft: 0,
        ci_status: "success",
        in_merge_queue: 0,
        auto_merge: 0,
        unresolved_threads: 0,
        additions: 1,
        deletions: 0,
        commits: 1,
        comment_count: 0,
        mergeable: "MERGEABLE",
        updated_at: `2026-01-0${n}T00:00:00Z`,
        payload: `{"id":${n},"number":${n}}`,
      });
      repo.replacePrs("x", "authored", [make(1), make(2), make(3)]);
      expect(repo.countPrsByKind("x")).toEqual([
        { kind: "authored", count: 3 },
      ]);

      repo.replacePrs("x", "authored", [make(4)]);
      expect(repo.countPrsByKind("x")).toEqual([
        { kind: "authored", count: 1 },
      ]);
      const payloads = repo.getPrPayloads("x", "authored") as {
        number: number;
      }[];
      expect(payloads.map((p) => p.number)).toEqual([4]);
    } finally {
      close();
    }
  });

  test("sync state upsert preserves last_etag when next call passes null", () => {
    const { repo, close } = openTestRepo();
    try {
      repo.upsertInstance({
        id: "x",
        label: "X",
        baseUrl: "https://api.github.com",
        username: "u",
      });
      repo.upsertSyncState({
        instance_id: "x",
        kind: "notifications",
        last_run_at: "2026-01-01T00:00:00Z",
        last_etag: '"abc"',
        last_modified: "Wed, 01 Jan 2026 00:00:00 GMT",
        rate_remaining: 4900,
        rate_reset_at: "2026-01-01T01:00:00Z",
      });
      repo.upsertSyncState({
        instance_id: "x",
        kind: "notifications",
        last_run_at: "2026-01-01T00:00:30Z",
        last_etag: null,
        last_modified: null,
        rate_remaining: null,
        rate_reset_at: null,
      });
      const state = repo.getSyncState("x", "notifications");
      expect(state?.last_etag).toBe('"abc"');
      expect(state?.last_run_at).toBe("2026-01-01T00:00:30Z");
    } finally {
      close();
    }
  });
});
