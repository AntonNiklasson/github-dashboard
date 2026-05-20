import { setCached } from "./cache.js";
import { getInstances } from "./config.js";
import { fetchNotifications, fetchPrs, fetchReviews } from "./fetchers.js";

const SYNC_INTERVAL = 30_000; // 30s

export type ResyncKey = "prs" | "reviews" | "notifications";

const RESYNC_FETCHERS: Record<
  ResyncKey,
  (instanceId: string) => Promise<unknown>
> = {
  prs: fetchPrs,
  reviews: fetchReviews,
  notifications: fetchNotifications,
};

const ALL_KEYS: ResyncKey[] = ["prs", "reviews", "notifications"];

const pending = new Set<Promise<unknown>>();

// Tracks recent client-driven mutations so a stale resync (GitHub's search
// index lags by seconds after a merge/close/draft toggle) doesn't re-introduce
// the old state. Entries expire after MUTATION_TTL.
type MutationRecord =
  | { kind: "removed"; repo: string; number: number; expiresAt: number }
  | {
      kind: "draft";
      repo: string;
      number: number;
      draft: boolean;
      expiresAt: number;
    };

const MUTATION_TTL = 60_000;
const mutations = new Map<string, MutationRecord>();

function mutationKey(instanceId: string, repo: string, number: number) {
  return `${instanceId}:${repo}:${number}`;
}

export function recordMutation(
  instanceId: string,
  m:
    | { kind: "removed"; repo: string; number: number }
    | { kind: "draft"; repo: string; number: number; draft: boolean },
): void {
  mutations.set(mutationKey(instanceId, m.repo, m.number), {
    ...m,
    expiresAt: Date.now() + MUTATION_TTL,
  });
}

function activeMutations(instanceId: string): MutationRecord[] {
  const now = Date.now();
  const out: MutationRecord[] = [];
  for (const [k, v] of mutations) {
    if (v.expiresAt <= now) {
      mutations.delete(k);
      continue;
    }
    if (k.startsWith(`${instanceId}:`)) out.push(v);
  }
  return out;
}

interface ListItem {
  repo: string;
  number: number;
  draft?: boolean;
}

function applyMutations(
  instanceId: string,
  key: ResyncKey,
  data: unknown,
): unknown {
  if (key !== "prs" && key !== "reviews") return data;
  const muts = activeMutations(instanceId);
  if (muts.length === 0) return data;
  const items = data as ListItem[];

  const filtered = items.filter(
    (item) =>
      !muts.some(
        (m) =>
          m.kind === "removed" &&
          m.repo === item.repo &&
          m.number === item.number,
      ),
  );

  if (key === "reviews") return filtered;

  return filtered.map((item) => {
    const draftMut = muts.find(
      (m): m is Extract<MutationRecord, { kind: "draft" }> =>
        m.kind === "draft" && m.repo === item.repo && m.number === item.number,
    );
    return draftMut ? { ...item, draft: draftMut.draft } : item;
  });
}

export async function resyncInstance(
  instanceId: string,
  keys: ResyncKey[] = ALL_KEYS,
): Promise<void> {
  await Promise.all(
    keys.map(async (key) => {
      try {
        const data = await RESYNC_FETCHERS[key](instanceId);
        setCached(
          `${instanceId}:${key}`,
          applyMutations(instanceId, key, data),
        );
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
