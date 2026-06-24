import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openCache, wipeCacheFile } from "./open.js";
import { CACHE_SCHEMA_VERSION } from "./schema.js";

describe("cache open", () => {
  let cacheRoot: string;
  let prevXdg: string | undefined;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), "ghd-cache-"));
    prevXdg = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = cacheRoot;
  });

  afterEach(() => {
    if (prevXdg === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = prevXdg;
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  test("creates file with current schema version on first open", () => {
    const { db, path, wiped } = openCache();
    expect(wiped).toBe(false);
    expect(path).toContain("github-dashboard/cache.sqlite");
    const row = db
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(Number(row.value)).toBe(CACHE_SCHEMA_VERSION);
    db.close();
  });

  test("reuses existing file when version matches", () => {
    const first = openCache();
    first.db
      .prepare(
        "INSERT INTO instances (id, label, base_url, username) VALUES ('x', 'X', 'https://api.github.com', 'u')",
      )
      .run();
    first.db.close();

    const second = openCache();
    expect(second.wiped).toBe(false);
    const count = (
      second.db.prepare("SELECT COUNT(*) AS n FROM instances").get() as {
        n: number;
      }
    ).n;
    expect(count).toBe(1);
    second.db.close();
  });

  test("wipes and recreates when stored version doesn't match code version", () => {
    const first = openCache();
    first.db
      .prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'")
      .run("999");
    first.db
      .prepare(
        "INSERT INTO instances (id, label, base_url, username) VALUES ('x', 'X', 'https://api.github.com', 'u')",
      )
      .run();
    first.db.close();

    const second = openCache();
    expect(second.wiped).toBe(true);
    const count = (
      second.db.prepare("SELECT COUNT(*) AS n FROM instances").get() as {
        n: number;
      }
    ).n;
    expect(count).toBe(0);
    second.db.close();
  });

  test("wipeCacheFile removes the file", () => {
    const { db } = openCache();
    db.close();
    const result = wipeCacheFile();
    expect(result.existed).toBe(true);
  });
});
