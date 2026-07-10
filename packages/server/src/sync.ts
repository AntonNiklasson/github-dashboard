import {
  createSqliteRepository,
  createSyncEngine,
  openCache,
  type PrKind,
  type SyncKind,
} from "sync";

const { db, path, wiped } = openCache();
const repo = createSqliteRepository(db);
const engine = createSyncEngine({ repo });
const pending = new Set<Promise<unknown>>();
type Mutation =
  | {
      kind: "removed";
      instanceId: string;
      repo: string;
      number: number;
      expiresAt: number;
    }
  | {
      kind: "draft";
      instanceId: string;
      repo: string;
      number: number;
      draft: boolean;
      expiresAt: number;
    };
const mutations: Mutation[] = [];
const MUTATION_TTL_MS = 60_000;

export type ResyncKey = SyncKind;

export function getPrs(instanceId: string, kind: PrKind): unknown[] {
  return repo.getPrPayloads(instanceId, kind);
}

export function getNotifications(instanceId: string) {
  return repo.listNotifications(instanceId).map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    reason: row.reason,
    repo: row.repo,
    url: row.url,
    unread: row.unread === 1,
    updatedAt: row.updated_at,
  }));
}

export function removePr(instanceId: string, repoName: string, number: number) {
  repo.removePr(instanceId, repoName, number);
  mutations.push({
    kind: "removed",
    instanceId,
    repo: repoName,
    number,
    expiresAt: Date.now() + MUTATION_TTL_MS,
  });
}

export function setPrDraft(
  instanceId: string,
  repoName: string,
  number: number,
  draft: boolean,
) {
  repo.setPrDraft(instanceId, repoName, number, draft);
  mutations.push({
    kind: "draft",
    instanceId,
    repo: repoName,
    number,
    draft,
    expiresAt: Date.now() + MUTATION_TTL_MS,
  });
}

export function removeNotification(instanceId: string, id: string) {
  repo.removeNotification(instanceId, id);
}

export async function resyncInstance(
  instanceId: string,
  keys: ResyncKey[] = ["prs", "reviews", "notifications"],
): Promise<void> {
  await Promise.all(
    keys.map(async (kind) => {
      const summary = await engine.runOnce({ instance: instanceId, kind });
      const now = Date.now();
      for (let i = mutations.length - 1; i >= 0; i--) {
        if (mutations[i].expiresAt <= now) mutations.splice(i, 1);
      }
      if (kind === "prs" || kind === "reviews") {
        for (const mutation of mutations) {
          if (mutation.instanceId !== instanceId) continue;
          if (mutation.kind === "removed") {
            repo.removePr(instanceId, mutation.repo, mutation.number);
          } else if (kind === "prs") {
            repo.setPrDraft(
              instanceId,
              mutation.repo,
              mutation.number,
              mutation.draft,
            );
          }
        }
      }
      for (const result of summary.results) {
        for (const fetch of result.fetches) {
          if (fetch.error) {
            console.error(
              `Sync failed for ${result.instanceId}:${fetch.kind}: ${fetch.error}`,
            );
          }
        }
      }
    }),
  );
}

export function scheduleResync(instanceId: string, keys: ResyncKey[]): void {
  const promise = resyncInstance(instanceId, keys).finally(() => {
    pending.delete(promise);
  });
  pending.add(promise);
}

export function scheduleFullResync(): void {
  const promise = engine.runOnce().finally(() => {
    pending.delete(promise);
  });
  pending.add(promise);
}

export async function waitForPendingResyncs(): Promise<void> {
  while (pending.size > 0) await Promise.allSettled(pending);
}

export function startSync() {
  console.log(`Sync cache: ${path}${wiped ? " (schema upgraded)" : ""}`);
  engine.start({
    onCycle: (summary) => {
      const count = summary.results.reduce(
        (total, result) =>
          total + result.fetches.reduce((n, fetch) => n + fetch.count, 0),
        0,
      );
      console.log(`Sync complete: ${count} row(s) in ${summary.durationMs}ms`);
    },
    onError: (err) => console.error("Sync failed:", err),
  });
}

export async function stopSync(): Promise<void> {
  await engine.stop();
  await waitForPendingResyncs();
  db.close();
}
