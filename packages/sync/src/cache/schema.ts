export const CACHE_SCHEMA_VERSION = 1;

export const SCHEMA_DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS instances (
  id        TEXT PRIMARY KEY,
  label     TEXT NOT NULL,
  base_url  TEXT NOT NULL,
  username  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prs (
  instance_id            TEXT NOT NULL,
  kind                   TEXT NOT NULL CHECK (kind IN ('authored', 'review_requested')),
  provider_ref           TEXT NOT NULL,
  number                 INTEGER NOT NULL,
  repo                   TEXT NOT NULL,
  title                  TEXT NOT NULL,
  author                 TEXT NOT NULL,
  draft                  INTEGER NOT NULL,
  ci_status              TEXT NOT NULL,
  in_merge_queue         INTEGER NOT NULL,
  auto_merge             INTEGER NOT NULL,
  unresolved_threads     INTEGER NOT NULL,
  additions              INTEGER NOT NULL,
  deletions              INTEGER NOT NULL,
  commits                INTEGER NOT NULL,
  comment_count          INTEGER NOT NULL,
  mergeable              TEXT,
  updated_at             TEXT NOT NULL,
  payload                TEXT NOT NULL CHECK (json_valid(payload)),
  PRIMARY KEY (instance_id, kind, provider_ref),
  FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prs_instance_kind ON prs(instance_id, kind);
CREATE INDEX IF NOT EXISTS idx_prs_updated ON prs(updated_at);

CREATE TABLE IF NOT EXISTS notifications (
  instance_id  TEXT NOT NULL,
  id           TEXT NOT NULL,
  title        TEXT NOT NULL,
  type         TEXT,
  reason       TEXT NOT NULL,
  repo         TEXT NOT NULL,
  url          TEXT NOT NULL,
  unread       INTEGER NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (instance_id, id),
  FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_instance ON notifications(instance_id);

CREATE TABLE IF NOT EXISTS sync_state (
  instance_id     TEXT NOT NULL,
  kind            TEXT NOT NULL,
  last_run_at     TEXT,
  last_etag       TEXT,
  last_modified   TEXT,
  rate_remaining  INTEGER,
  rate_reset_at   TEXT,
  PRIMARY KEY (instance_id, kind),
  FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
);
`;
