export const CACHE_SCHEMA_VERSION = 2;
export const SCHEMA_DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS instances (
 id TEXT PRIMARY KEY, label TEXT NOT NULL, base_url TEXT NOT NULL,
 username TEXT NOT NULL, credential_key TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS prs (
 instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('prs','reviews')),
 provider_ref TEXT NOT NULL, updated_at TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(instance_id, kind, provider_ref)
);
CREATE TABLE IF NOT EXISTS notifications (
 instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
 id TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
 updated_at TEXT NOT NULL, PRIMARY KEY(instance_id, id)
);
CREATE TABLE IF NOT EXISTS sync_state (
 instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, last_run_at TEXT, last_etag TEXT,
 PRIMARY KEY(instance_id,kind)
);
CREATE TABLE IF NOT EXISTS budgets (
 instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
 resource TEXT NOT NULL, remaining INTEGER, reset_at TEXT,
 PRIMARY KEY(instance_id,resource)
);
`;
