import { setCached } from "./cache.js";
import { getInstances } from "./config.js";
import {
  fetchNotifications,
  fetchPrs,
  fetchRecentPrs,
  fetchReviews,
} from "./fetchers.js";

const SYNC_INTERVAL = 30_000; // 30s

export type ResyncKey = "prs" | "recent-prs" | "reviews" | "notifications";

const RESYNC_FETCHERS: Record<
  ResyncKey,
  (instanceId: string) => Promise<unknown>
> = {
  prs: fetchPrs,
  "recent-prs": fetchRecentPrs,
  reviews: fetchReviews,
  notifications: fetchNotifications,
};

const ALL_KEYS: ResyncKey[] = ["prs", "recent-prs", "reviews", "notifications"];

const pending = new Set<Promise<unknown>>();

export async function resyncInstance(
  instanceId: string,
  keys: ResyncKey[] = ALL_KEYS,
): Promise<void> {
  await Promise.all(
    keys.map(async (key) => {
      try {
        const data = await RESYNC_FETCHERS[key](instanceId);
        setCached(`${instanceId}:${key}`, data);
      } catch (err) {
        console.error(
          `Sync failed for ${instanceId}:${key}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );
}

/**
 * Fire-and-forget resync after a mutation. Lets the route respond fast while
 * the cache is refreshed in the background, so the next client poll sees the
 * new state without waiting for the 30s sync cycle.
 */
export function scheduleResync(instanceId: string, keys: ResyncKey[]): void {
  const p = resyncInstance(instanceId, keys).finally(() => {
    pending.delete(p);
  });
  pending.add(p);
}

/** Test seam: await all in-flight resyncs. */
export async function waitForPendingResyncs(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled(pending);
  }
}

async function syncAll() {
  const instances = await getInstances();
  if (instances.length === 0) {
    console.log("No instances configured, skipping sync");
    return;
  }
  console.log(`Syncing ${instances.length} instance(s)...`);
  await Promise.all(instances.map((inst) => resyncInstance(inst.id)));
  console.log("Sync complete");
}

export function startSync() {
  // Initial sync immediately
  syncAll();
  // Then repeat
  setInterval(syncAll, SYNC_INTERVAL);
}
