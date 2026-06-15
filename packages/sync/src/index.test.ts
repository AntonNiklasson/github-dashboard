import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
// Import only from the public surface — anything missing here means callers
// (notably the server in Phase B of #72) would have to reach into internals.
import {
  CACHE_SCHEMA_VERSION,
  type GitHubInstance,
  type Repository,
  type SyncEngine,
  createSqliteRepository,
  createSyncEngine,
  openCache,
  reconcileInstances,
} from "./index.js";

describe("public surface", () => {
  let cacheRoot: string;
  let prevXdg: string | undefined;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), "ghd-public-"));
    prevXdg = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = cacheRoot;
  });

  afterEach(() => {
    if (prevXdg === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = prevXdg;
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  test("composes from public exports the way the server would", () => {
    const { db, path } = openCache();
    try {
      expect(path).toContain("github-dashboard/cache.sqlite");

      const repo: Repository = createSqliteRepository(db);
      expect(repo.getSchemaVersion()).toBe(CACHE_SCHEMA_VERSION);

      const fakeInstances: GitHubInstance[] = [
        {
          id: "github-com",
          label: "github.com",
          baseUrl: "https://api.github.com",
          token: "redacted",
          username: "u",
        },
      ];
      const { added, removed } = reconcileInstances(repo, fakeInstances);
      expect(added).toEqual(["github-com"]);
      expect(removed).toEqual([]);

      expect(repo.listInstanceIds()).toEqual(["github-com"]);
      expect(repo.getPrPayloads("github-com", "authored")).toEqual([]);
      expect(repo.listNotifications("github-com")).toEqual([]);

      const engine: SyncEngine = createSyncEngine({
        repo,
        // Inject fake config so we don't hit the real ~/.config or network.
        loadInstances: async () => fakeInstances,
      });
      expect(engine.isRunning()).toBe(false);
    } finally {
      db.close();
    }
  });
});
