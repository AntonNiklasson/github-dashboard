import { createSync, type CacheMutation, type SyncKind } from "sync";
import { getCached } from "./cache.js";
import { loadSyncInstances, type GitHubInstance } from "./config.js";

const SYNC_INTERVAL = 30_000;
export type ResyncKey = SyncKind;
const ALL_KEYS: ResyncKey[] = ["prs", "reviews", "notifications"];
let runtime: ReturnType<typeof createSync> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let stopped = false;
const pending = new Map<string, Promise<void>>();

export function getSync() {
  if (process.env.DEMO === "1")
    throw new Error("mutations are disabled in demo mode");
  if (stopped) throw new Error("server sync is closed");
  return (runtime ??= createSync({ loadInstances: loadSyncInstances }));
}

export async function listData(
  instanceId: string,
  kind: ResyncKey,
  fresh = false,
) {
  // Demo fixtures must never open or write the user's shared cache.
  if (process.env.DEMO === "1") return getCached(`${instanceId}:${kind}`) ?? [];
  const engine = getSync();
  await engine.reconcileConfiguration();
  if (!engine.listInstances().some((i) => i.id === instanceId))
    throw new Error(`unknown instance: ${instanceId}`);
  const state = engine.getSyncState(instanceId, kind);
  if (fresh || !state?.last_run_at) {
    const result = await engine.sync({ instanceId, kinds: [kind] });
    const failure = result.results[0]?.fetches.find(
      (f) =>
        f.status === "failed" ||
        (!state?.last_run_at && f.status === "skipped"),
    );
    if (failure) throw new Error(failure.reason ?? "Sync failed");
  } else if (Date.now() - Date.parse(state.last_run_at) >= SYNC_INTERVAL) {
    scheduleResync(instanceId, [kind]);
  }
  return kind === "notifications"
    ? engine.listNotifications(instanceId)
    : engine.listPullRequests(instanceId, kind);
}

export async function reloadSyncConfiguration(): Promise<void> {
  if (process.env.DEMO === "1") return;
  // The engine re-reads valid raw config independently of auth diagnostics:
  // removed instances/rotated credentials are purged even when auth fails.
  await getSync().reconcileConfiguration();
}

export async function recordMutation(
  instanceId: string,
  mutation: CacheMutation,
  expectedIdentity?: Pick<GitHubInstance, "baseUrl" | "token">,
) {
  await getSync().recordMutation(instanceId, mutation, expectedIdentity);
}

export async function resyncInstance(
  instanceId: string,
  keys: ResyncKey[] = ALL_KEYS,
): Promise<void> {
  const result = await getSync().sync({ instanceId, kinds: keys });
  for (const { fetches } of result.results) {
    for (const f of fetches) {
      if (f.status === "failed")
        console.error(`Sync failed for ${instanceId}:${f.kind}:`, f.reason);
    }
  }
}

export function scheduleResync(instanceId: string, keys: ResyncKey[]): void {
  if (stopped || process.env.DEMO === "1") return;
  const key = `${instanceId}:${[...keys].sort().join(",")}`;
  if (pending.has(key)) return;
  const work = resyncInstance(instanceId, keys)
    .catch((err) =>
      console.error("Sync failed:", err instanceof Error ? err.message : err),
    )
    .finally(() => pending.delete(key));
  pending.set(key, work);
}

export async function waitForPendingResyncs(): Promise<void> {
  while (pending.size) await Promise.allSettled(pending.values());
}

async function syncAll() {
  try {
    // One queued cycle avoids overlap and reconciles config before fetching.
    await getSync().sync();
  } catch (err) {
    console.error("Sync failed:", err instanceof Error ? err.message : err);
  }
}

export function startSync() {
  if (stopped || interval || process.env.DEMO === "1") return;
  const tick = () => {
    if (pending.has("all")) return;
    const work = syncAll().finally(() => pending.delete("all"));
    pending.set("all", work);
  };
  tick();
  interval = setInterval(tick, SYNC_INTERVAL);
  interval.unref();
}

export function stopSyncPolling() {
  if (interval) clearInterval(interval);
  interval = undefined;
}

export async function stopSync() {
  stopped = true;
  stopSyncPolling();
  await waitForPendingResyncs();
  await runtime?.close();
}
