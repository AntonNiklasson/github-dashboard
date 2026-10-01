import type { Cache } from "./open.js";
import type { NormalizedPr } from "../providers/github/normalize.js";

export interface Notification {
  id: string;
  title: string;
  type: string | null;
  reason: string;
  repo: string;
  url: string;
  unread: boolean;
  updatedAt: string;
}
export interface Instance {
  id: string;
  label: string;
  username: string;
}
export type Kind = "prs" | "reviews" | "notifications";
export interface Metadata {
  etag?: string | null;
  remaining?: number | null;
  resetAt?: string | null;
}
export function createStore(db: Cache) {
  const listInstances = db.prepare(
    "SELECT id,label,username FROM instances ORDER BY id",
  );
  const oldInstance = db.prepare("SELECT * FROM instances WHERE id = ?");
  const upsert =
    db.prepare(`INSERT INTO instances VALUES (@id,@label,@baseUrl,@username,@credentialKey)
    ON CONFLICT(id) DO UPDATE SET label=excluded.label,base_url=excluded.base_url,
    username=excluded.username,credential_key=excluded.credential_key`);
  const remove = db.prepare("DELETE FROM instances WHERE id = ?");
  const clear = db.prepare(
    "DELETE FROM prs WHERE instance_id = ? AND kind = ?",
  );
  const insert = db.prepare("INSERT INTO prs VALUES (?,?,?,?,?)");
  const clearNotifications = db.prepare(
    "DELETE FROM notifications WHERE instance_id = ?",
  );
  const insertNotification = db.prepare(
    "INSERT INTO notifications VALUES (?,?,?,?)",
  );
  const state = db.prepare(
    "SELECT * FROM sync_state WHERE instance_id = ? AND kind = ?",
  );
  const saveState =
    db.prepare(`INSERT INTO sync_state VALUES (?,?,?,?) ON CONFLICT(instance_id,kind)
    DO UPDATE SET last_run_at=excluded.last_run_at,last_etag=COALESCE(excluded.last_etag,sync_state.last_etag)`);
  const budget = db.prepare(
    "SELECT * FROM budgets WHERE instance_id = ? AND resource = ?",
  );
  const saveBudget =
    db.prepare(`INSERT INTO budgets VALUES (?,?,?,?) ON CONFLICT(instance_id,resource)
    DO UPDATE SET remaining=excluded.remaining,reset_at=excluded.reset_at`);

  function recordBudget(id: string, resource: string, metadata: Metadata) {
    if (metadata.remaining !== undefined && metadata.remaining !== null) {
      saveBudget.run(
        id,
        resource,
        metadata.remaining,
        metadata.resetAt ?? null,
      );
    }
  }
  return {
    listInstances: () => listInstances.all() as Instance[],
    reconcile(
      configured: {
        id: string;
        label: string;
        baseUrl: string;
        username?: string;
        credentialKey?: string;
      }[],
    ) {
      db.transaction(() => {
        const ids = new Set(configured.map((i) => i.id));
        for (const i of configured) {
          const old = oldInstance.get(i.id) as
            | { base_url: string; username: string; credential_key: string }
            | undefined;
          const changed =
            !!old &&
            ((i.credentialKey !== undefined && old.base_url !== i.baseUrl) ||
              (i.username !== undefined && old.username !== i.username) ||
              (i.credentialKey !== undefined &&
                old.credential_key !== i.credentialKey));
          if (changed) remove.run(i.id);
          upsert.run({
            ...i,
            // A new identity must not inherit the previous login.
            username: i.username ?? (changed ? "" : (old?.username ?? "")),
            credentialKey: i.credentialKey ?? old?.credential_key ?? "",
          });
        }
        for (const i of this.listInstances())
          if (!ids.has(i.id)) remove.run(i.id);
      })();
    },
    listPullRequests(id: string, kind: "prs" | "reviews"): NormalizedPr[] {
      return (
        db
          .prepare(
            "SELECT payload FROM prs WHERE instance_id=? AND kind=? ORDER BY updated_at DESC, provider_ref",
          )
          .all(id, kind) as { payload: string }[]
      ).map((r) => JSON.parse(r.payload) as NormalizedPr);
    },
    listNotifications(id: string): Notification[] {
      return (
        db
          .prepare(
            "SELECT payload FROM notifications WHERE instance_id=? ORDER BY updated_at DESC, id",
          )
          .all(id) as { payload: string }[]
      ).map((r) => JSON.parse(r.payload) as Notification);
    },
    state: (id: string, kind: Kind) =>
      state.get(id, kind) as { last_etag: string | null } | undefined,
    budget: (id: string, resource: string) =>
      budget.get(id, resource) as
        | { remaining: number | null; reset_at: string | null }
        | undefined,
    recordBudget,
    save(
      id: string,
      kind: Kind,
      data: NormalizedPr[] | Notification[] | null,
      metadata: Metadata,
    ) {
      db.transaction(() => {
        if (data !== null) {
          if (kind === "notifications") {
            clearNotifications.run(id);
            for (const item of data as Notification[])
              insertNotification.run(
                id,
                item.id,
                JSON.stringify(item),
                item.updatedAt,
              );
          } else {
            clear.run(id, kind);
            for (const item of data as NormalizedPr[])
              insert.run(
                id,
                kind,
                String(item.id),
                item.updatedAt,
                JSON.stringify(item),
              );
          }
        }
        saveState.run(
          id,
          kind,
          new Date().toISOString(),
          metadata.etag ?? null,
        );
        recordBudget(
          id,
          kind === "notifications" ? "rest" : "graphql",
          metadata,
        );
      })();
    },
  };
}
