import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { resolveCachePath } from "./path.js";
import { CACHE_SCHEMA_VERSION, SCHEMA_DDL } from "./schema.js";

export type Cache = Database.Database;

export interface OpenCacheResult {
  db: Cache;
  path: string;
  wiped: boolean;
}

export function openCache(): OpenCacheResult {
  const path = resolveCachePath();
  mkdirSync(dirname(path), { recursive: true });

  let db = new Database(path);
  db.exec(SCHEMA_DDL);

  const stored = readSchemaVersion(db);
  if (stored !== null && stored !== CACHE_SCHEMA_VERSION) {
    db.close();
    deleteCacheFiles(path);
    db = new Database(path);
    db.exec(SCHEMA_DDL);
    writeSchemaVersion(db, CACHE_SCHEMA_VERSION);
    return { db, path, wiped: true };
  }
  if (stored === null) {
    writeSchemaVersion(db, CACHE_SCHEMA_VERSION);
  }
  return { db, path, wiped: false };
}

function readSchemaVersion(db: Cache): number | null {
  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;
  if (!row) return null;
  const n = Number.parseInt(row.value, 10);
  return Number.isFinite(n) ? n : null;
}

function writeSchemaVersion(db: Cache, version: number): void {
  db.prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
  ).run(String(version));
}

export function wipeCacheFile(): { existed: boolean; path: string } {
  const path = resolveCachePath();
  const existed = existsSync(path);
  deleteCacheFiles(path);
  return { existed, path };
}

function deleteCacheFiles(path: string): void {
  for (const p of [path, `${path}-wal`, `${path}-shm`]) {
    if (existsSync(p)) rmSync(p, { force: true });
  }
}
