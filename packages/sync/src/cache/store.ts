import type { Cache } from "./open.js";

export interface InstanceRow {
  id: string;
  label: string;
  baseUrl: string;
  username: string;
}

export interface InstanceSummary {
  id: string;
  label: string;
  username: string;
}

export type PrKind = "authored" | "review_requested";

export interface PrRow {
  instance_id: string;
  kind: PrKind;
  provider_ref: string;
  number: number;
  repo: string;
  title: string;
  author: string;
  draft: number;
  ci_status: string;
  in_merge_queue: number;
  auto_merge: number;
  unresolved_threads: number;
  additions: number;
  deletions: number;
  commits: number;
  comment_count: number;
  mergeable: string | null;
  updated_at: string;
  payload: string;
}

export interface NotificationRow {
  instance_id: string;
  id: string;
  title: string;
  type: string | null;
  reason: string;
  repo: string;
  url: string;
  unread: number;
  updated_at: string;
}

export interface SyncStateRow {
  instance_id: string;
  kind: string;
  last_run_at: string | null;
  last_etag: string | null;
  last_modified: string | null;
  rate_remaining: number | null;
  rate_reset_at: string | null;
}

export interface PrKindCount {
  kind: PrKind;
  count: number;
}

// Repository is the contract the rest of the engine depends on. Providers,
// the sync orchestrator, and the CLI take a Repository rather than a raw
// SQLite handle — keeps the SQL inside one module and makes swapping in a
// fake for tests a one-liner.
export interface Repository {
  // instances
  listInstances(): InstanceSummary[];
  listInstanceIds(): string[];
  upsertInstance(row: InstanceRow): void;
  deleteInstance(id: string): void;

  // prs
  replacePrs(instanceId: string, kind: PrKind, rows: PrRow[]): void;
  getPrPayloads(instanceId: string, kind: PrKind): unknown[];
  countPrsByKind(instanceId: string): PrKindCount[];

  // notifications
  replaceNotifications(instanceId: string, rows: NotificationRow[]): void;
  listNotifications(instanceId: string): NotificationRow[];
  countNotifications(instanceId: string): number;

  // sync state
  getSyncState(instanceId: string, kind: string): SyncStateRow | null;
  listSyncStates(instanceId: string): SyncStateRow[];
  upsertSyncState(row: SyncStateRow): void;

  // meta
  getSchemaVersion(): number | null;
}

export function createSqliteRepository(db: Cache): Repository {
  const stmts = {
    listInstances: db.prepare(
      "SELECT id, label, username FROM instances ORDER BY id",
    ),
    listInstanceIds: db.prepare("SELECT id FROM instances ORDER BY id"),
    upsertInstance: db.prepare(
      `INSERT INTO instances (id, label, base_url, username)
       VALUES (@id, @label, @baseUrl, @username)
       ON CONFLICT(id) DO UPDATE SET
         label = excluded.label,
         base_url = excluded.base_url,
         username = excluded.username`,
    ),
    deleteInstance: db.prepare("DELETE FROM instances WHERE id = ?"),

    deletePrsByKind: db.prepare(
      "DELETE FROM prs WHERE instance_id = ? AND kind = ?",
    ),
    insertPr: db.prepare(
      `INSERT INTO prs (
        instance_id, kind, provider_ref, number, repo, title, author, draft,
        ci_status, in_merge_queue, auto_merge, unresolved_threads,
        additions, deletions, commits, comment_count, mergeable, updated_at, payload
      ) VALUES (
        @instance_id, @kind, @provider_ref, @number, @repo, @title, @author, @draft,
        @ci_status, @in_merge_queue, @auto_merge, @unresolved_threads,
        @additions, @deletions, @commits, @comment_count, @mergeable, @updated_at, @payload
      )`,
    ),
    selectPrPayloads: db.prepare(
      "SELECT payload FROM prs WHERE instance_id = ? AND kind = ? ORDER BY updated_at DESC",
    ),
    countPrsByKind: db.prepare(
      "SELECT kind, COUNT(*) AS count FROM prs WHERE instance_id = ? GROUP BY kind",
    ),

    deleteNotifications: db.prepare(
      "DELETE FROM notifications WHERE instance_id = ?",
    ),
    insertNotification: db.prepare(
      `INSERT INTO notifications (
        instance_id, id, title, type, reason, repo, url, unread, updated_at
      ) VALUES (
        @instance_id, @id, @title, @type, @reason, @repo, @url, @unread, @updated_at
      )`,
    ),
    listNotifications: db.prepare(
      "SELECT * FROM notifications WHERE instance_id = ? ORDER BY updated_at DESC",
    ),
    countNotifications: db.prepare(
      "SELECT COUNT(*) AS n FROM notifications WHERE instance_id = ?",
    ),

    getSyncState: db.prepare(
      "SELECT * FROM sync_state WHERE instance_id = ? AND kind = ?",
    ),
    listSyncStates: db.prepare(
      "SELECT * FROM sync_state WHERE instance_id = ? ORDER BY kind",
    ),
    upsertSyncState: db.prepare(
      `INSERT INTO sync_state (
        instance_id, kind, last_run_at, last_etag, last_modified, rate_remaining, rate_reset_at
      ) VALUES (
        @instance_id, @kind, @last_run_at, @last_etag, @last_modified, @rate_remaining, @rate_reset_at
      )
      ON CONFLICT(instance_id, kind) DO UPDATE SET
        last_run_at = excluded.last_run_at,
        last_etag = COALESCE(excluded.last_etag, sync_state.last_etag),
        last_modified = COALESCE(excluded.last_modified, sync_state.last_modified),
        rate_remaining = excluded.rate_remaining,
        rate_reset_at = excluded.rate_reset_at`,
    ),

    getSchemaVersion: db.prepare(
      "SELECT value FROM meta WHERE key = 'schema_version'",
    ),
  };

  const replacePrsTx = db.transaction(
    (instanceId: string, kind: PrKind, rows: PrRow[]) => {
      stmts.deletePrsByKind.run(instanceId, kind);
      for (const row of rows) stmts.insertPr.run(row);
    },
  );

  const replaceNotificationsTx = db.transaction(
    (instanceId: string, rows: NotificationRow[]) => {
      stmts.deleteNotifications.run(instanceId);
      for (const row of rows) stmts.insertNotification.run(row);
    },
  );

  return {
    listInstances: () => stmts.listInstances.all() as InstanceSummary[],
    listInstanceIds: () =>
      (stmts.listInstanceIds.all() as { id: string }[]).map((r) => r.id),
    upsertInstance: (row) => {
      stmts.upsertInstance.run(row);
    },
    deleteInstance: (id) => {
      stmts.deleteInstance.run(id);
    },

    replacePrs: (instanceId, kind, rows) => {
      replacePrsTx(instanceId, kind, rows);
    },
    getPrPayloads: (instanceId, kind) =>
      (
        stmts.selectPrPayloads.all(instanceId, kind) as { payload: string }[]
      ).map((r) => JSON.parse(r.payload)),
    countPrsByKind: (instanceId) =>
      stmts.countPrsByKind.all(instanceId) as PrKindCount[],

    replaceNotifications: (instanceId, rows) => {
      replaceNotificationsTx(instanceId, rows);
    },
    listNotifications: (instanceId) =>
      stmts.listNotifications.all(instanceId) as NotificationRow[],
    countNotifications: (instanceId) =>
      (stmts.countNotifications.get(instanceId) as { n: number }).n,

    getSyncState: (instanceId, kind) =>
      (stmts.getSyncState.get(instanceId, kind) as SyncStateRow | undefined) ??
      null,
    listSyncStates: (instanceId) =>
      stmts.listSyncStates.all(instanceId) as SyncStateRow[],
    upsertSyncState: (row) => {
      stmts.upsertSyncState.run(row);
    },

    getSchemaVersion: () => {
      const row = stmts.getSchemaVersion.get() as { value: string } | undefined;
      if (!row) return null;
      const n = Number.parseInt(row.value, 10);
      return Number.isFinite(n) ? n : null;
    },
  };
}
