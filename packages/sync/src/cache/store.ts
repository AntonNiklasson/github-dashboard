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
export type PullRequestPatch = Partial<
  Pick<NormalizedPr, "draft" | "title" | "autoMerge" | "ciStatus">
>;
export type CacheMutation =
  | { kind: "removed"; repo: string; number: number }
  | { kind: "patch"; repo: string; number: number; patch: PullRequestPatch }
  | { kind: "notificationDone"; id: string };

export interface SyncHealth {
  instanceId: string;
  kind: Kind;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  status: "never" | "syncing" | "updated" | "unchanged" | "skipped" | "failed";
  reason: string | null;
  retryAt: string | null;
}

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

  function recordBudget(
    id: string,
    resource: string,
    metadata: Metadata,
    credentialKey?: string,
  ) {
    db.transaction(() => {
      if (credentialKey !== undefined) {
        const current = oldInstance.get(id) as
          | { credential_key: string }
          | undefined;
        if (current?.credential_key !== credentialKey) return;
      }
      if (metadata.remaining !== undefined && metadata.remaining !== null) {
        saveBudget.run(
          id,
          resource,
          metadata.remaining,
          metadata.resetAt ?? null,
        );
      }
    })();
  }

  // Guards live beside snapshots so another process/in-flight fetch cannot
  // resurrect stale search-index data after a successful write.
  const clearNotificationEtag = db.prepare(
    "UPDATE sync_state SET last_etag=NULL WHERE instance_id=? AND kind='notifications'",
  );
  const hasNotificationGuard = db.prepare(
    "SELECT 1 FROM mutation_guards WHERE instance_id=? AND target LIKE 'notification:%' AND expires_at>? LIMIT 1",
  );
  const guards = db.prepare(
    "SELECT payload FROM mutation_guards WHERE instance_id=? AND expires_at>?",
  );
  function applyMutations<T extends NormalizedPr | Notification>(
    id: string,
    kind: Kind,
    data: T[],
  ): T[] {
    const mutations = (guards.all(id, Date.now()) as { payload: string }[]).map(
      (r) => JSON.parse(r.payload) as CacheMutation,
    );
    return data.flatMap((item) => {
      if (kind === "notifications") {
        return mutations.some(
          (m) =>
            m.kind === "notificationDone" && m.id === (item as Notification).id,
        )
          ? []
          : [item];
      }
      let patched = item;
      for (const m of mutations) {
        if (
          m.kind === "notificationDone" ||
          m.repo !== (item as NormalizedPr).repo ||
          m.number !== (item as NormalizedPr).number
        )
          continue;
        if (m.kind === "removed") return [];
        patched = { ...patched, ...m.patch };
      }
      return [patched];
    });
  }
  return {
    recordMutation(
      id: string,
      mutation: CacheMutation,
      credentialKey?: string,
    ) {
      db.transaction(() => {
        const current = oldInstance.get(id) as
          | { credential_key: string }
          | undefined;
        if (
          credentialKey !== undefined &&
          current?.credential_key !== credentialKey
        )
          return;
        db.prepare("DELETE FROM mutation_guards WHERE expires_at<=?").run(
          Date.now(),
        );
        const target =
          mutation.kind === "notificationDone"
            ? `notification:${mutation.id}`
            : `pr:${mutation.repo}:${mutation.number}`;
        const previous = db
          .prepare(
            "SELECT payload FROM mutation_guards WHERE instance_id=? AND target=?",
          )
          .get(id, target) as { payload: string } | undefined;
        const old = previous
          ? (JSON.parse(previous.payload) as CacheMutation)
          : undefined;
        const merged =
          old?.kind === "removed"
            ? old
            : old?.kind === "patch" && mutation.kind === "patch"
              ? { ...mutation, patch: { ...old.patch, ...mutation.patch } }
              : mutation;
        db.prepare(
          "INSERT OR REPLACE INTO mutation_guards VALUES (?,?,?,?)",
        ).run(id, target, JSON.stringify(merged), Date.now() + 60_000);
        for (const kind of ["prs", "reviews"] as const) {
          const items = applyMutations(
            id,
            kind,
            this.listPullRequests(id, kind),
          );
          clear.run(id, kind);
          for (const item of items)
            insert.run(
              id,
              kind,
              String(item.id),
              item.updatedAt,
              JSON.stringify(item),
            );
        }
        const notifications = applyMutations(
          id,
          "notifications",
          this.listNotifications(id),
        );
        clearNotifications.run(id);
        for (const item of notifications)
          insertNotification.run(
            id,
            item.id,
            JSON.stringify(item),
            item.updatedAt,
          );
        // A dismissal changes the local snapshot; don't reuse an ETag for its old contents.
        if (mutation.kind === "notificationDone") clearNotificationEtag.run(id);
      })();
    },
    health(id: string, kind: Kind): SyncHealth {
      const row = db
        .prepare("SELECT * FROM sync_health WHERE instance_id=? AND kind=?")
        .get(id, kind) as
        | {
            attempted_at: string;
            status: SyncHealth["status"];
            reason: string | null;
            retry_at: string | null;
          }
        | undefined;
      const snapshot = state.get(id, kind) as
        | { last_run_at: string | null }
        | undefined;
      return {
        instanceId: id,
        kind,
        lastSuccessAt: snapshot?.last_run_at ?? null,
        lastAttemptAt: row?.attempted_at ?? null,
        status: row?.status ?? "never",
        reason: row?.reason ?? null,
        retryAt: row?.retry_at ?? null,
      };
    },
    recordHealth(
      id: string,
      kind: Kind,
      outcome: Pick<SyncHealth, "status" | "reason" | "retryAt">,
      credentialKey: string,
    ) {
      return db.transaction(() => {
        const current = oldInstance.get(id) as
          | { credential_key: string }
          | undefined;
        if (current?.credential_key !== credentialKey) return false;
        db.prepare(
          "INSERT OR REPLACE INTO sync_health VALUES (?,?,?,?,?,?)",
        ).run(
          id,
          kind,
          new Date().toISOString(),
          outcome.status,
          outcome.reason,
          outcome.retryAt,
        );
        return true;
      })();
    },
    listInstances: () => listInstances.all() as Instance[],
    updateAuthenticatedIdentity(
      id: string,
      expectedCredentialKey: string,
      username: string,
    ): boolean {
      return db.transaction(() => {
        const current = oldInstance.get(id) as
          | {
              label: string;
              base_url: string;
              username: string;
              credential_key: string;
            }
          | undefined;
        // Authentication may finish after another runtime rotates or removes
        // this identity. Update only the row whose credentials were checked.
        if (current?.credential_key !== expectedCredentialKey) return false;
        if (current.username !== username) {
          remove.run(id);
          upsert.run({
            id,
            label: current.label,
            baseUrl: current.base_url,
            username,
            credentialKey: current.credential_key,
          });
        }
        return true;
      })();
    },
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
      state.get(id, kind) as
        | { last_run_at: string | null; last_etag: string | null }
        | undefined,
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
      identity?: { credentialKey: string; username: string },
    ): boolean {
      return db.transaction(() => {
        const current = oldInstance.get(id) as
          | { credential_key: string; username: string }
          | undefined;
        // Another runtime may have reconciled a rotated identity while this
        // request was on the wire. Never publish its old credential's data.
        if (
          identity &&
          (!current ||
            current.credential_key !== identity.credentialKey ||
            current.username !== identity.username)
        )
          return false;
        if (data !== null) {
          if (kind === "notifications") {
            clearNotifications.run(id);
            for (const item of applyMutations(id, kind, data as Notification[]))
              insertNotification.run(
                id,
                item.id,
                JSON.stringify(item),
                item.updatedAt,
              );
          } else {
            clear.run(id, kind);
            for (const item of applyMutations(id, kind, data as NormalizedPr[]))
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
        // A guarded snapshot isn't the full upstream representation. Keep
        // fetching unconditionally until guards expire, or a revived thread
        // could stay hidden forever behind an unchanged ETag.
        if (
          kind === "notifications" &&
          hasNotificationGuard.get(id, Date.now())
        )
          clearNotificationEtag.run(id);
        recordBudget(
          id,
          kind === "notifications" ? "rest" : "graphql",
          metadata,
        );
        return true;
      })();
    },
  };
}
