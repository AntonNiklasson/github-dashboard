import type { Repository } from "./cache/store.js";
import { type GitHubInstance, loadInstances } from "./config.js";
import { fetchNotifications } from "./providers/github/fetchNotifications.js";
import { fetchAuthoredPrs } from "./providers/github/fetchPrs.js";
import { fetchReviews } from "./providers/github/fetchReviews.js";

const RATE_LIMIT_FLOOR = 200;
const DEFAULT_INTERVAL_MS = 25_000;

export type SyncKind = "prs" | "reviews" | "notifications";

export interface SyncCycleOptions {
  instance?: string;
  kind?: SyncKind;
}

export interface SyncCycleSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  results: InstanceResult[];
}

export interface InstanceResult {
  instanceId: string;
  fetches: FetchSummary[];
}

export interface FetchSummary {
  kind: SyncKind | "authored" | "review_requested";
  count: number;
  notModified?: boolean;
  rateRemaining: number | null;
  rateResetAt?: string | null;
  error?: string;
}

export interface SyncEngineDeps {
  repo: Repository;
  // Default reads ~/.config/github-dashboard/config.yml and probes each
  // instance via Octokit. Override in tests to inject fake instances without
  // touching the filesystem or network.
  loadInstances?: () => Promise<GitHubInstance[]>;
}

export interface SyncLoopOptions {
  // Milliseconds to wait AFTER a cycle finishes before starting the next.
  // Not a fixed wall-clock interval — prevents pile-up if a cycle runs long.
  // Default: 25_000.
  intervalMs?: number;
  // Called after each completed cycle with the summary. Useful for logging.
  onCycle?: (summary: SyncCycleSummary) => void;
  // Called when a cycle's loadInstances() or any internal step throws.
  // Individual provider fetches are already caught internally and surfaced
  // as FetchSummary.error, so this only fires on outer/structural failures.
  onError?: (err: unknown) => void;
}

export interface SyncEngine {
  runOnce(opts?: SyncCycleOptions): Promise<SyncCycleSummary>;
  start(opts?: SyncLoopOptions): void;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { repo, loadInstances: loadInstancesImpl = loadInstances } = deps;

  // Loop state. `running` is the canonical "are we looping" flag. `loopDone`
  // resolves when the loop's async function actually exits — stop() awaits it
  // so callers can be sure no in-flight cycle is still mutating the repo.
  let running = false;
  let stopRequested = false;
  let loopDone: Promise<void> | null = null;
  let sleepCanceller: (() => void) | null = null;

  async function runOnce(
    opts: SyncCycleOptions = {},
  ): Promise<SyncCycleSummary> {
    const startedAt = new Date();
    const configured = await loadInstancesImpl();
    reconcileInstances(repo, configured);

    const targets = opts.instance
      ? configured.filter((i) => i.id === opts.instance)
      : configured;
    if (opts.instance && targets.length === 0) {
      throw new Error(`unknown instance: ${opts.instance}`);
    }

    const results: InstanceResult[] = [];
    for (const instance of targets) {
      const fetches: FetchSummary[] = [];
      const wantPrs = !opts.kind || opts.kind === "prs";
      const wantReviews = !opts.kind || opts.kind === "reviews";
      const wantNotifications = !opts.kind || opts.kind === "notifications";

      if (wantPrs) {
        fetches.push(
          await guardedRun(repo, instance.id, "authored", () =>
            fetchAuthoredPrs(repo, instance),
          ),
        );
      }
      if (wantReviews) {
        fetches.push(
          await guardedRun(repo, instance.id, "review_requested", () =>
            fetchReviews(repo, instance),
          ),
        );
      }
      if (wantNotifications) {
        fetches.push(
          await guardedRun(repo, instance.id, "notifications", () =>
            fetchNotifications(repo, instance),
          ),
        );
      }
      results.push({ instanceId: instance.id, fetches });
    }

    const finishedAt = new Date();
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      results,
    };
  }

  function start(opts: SyncLoopOptions = {}): void {
    if (running) {
      throw new Error("SyncEngine is already running");
    }
    const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    running = true;
    stopRequested = false;

    loopDone = (async () => {
      try {
        while (!stopRequested) {
          try {
            const summary = await runOnce();
            opts.onCycle?.(summary);
          } catch (err) {
            opts.onError?.(err);
          }
          if (stopRequested) break;
          await interruptibleSleep(intervalMs, (cancel) => {
            sleepCanceller = cancel;
          });
          sleepCanceller = null;
        }
      } finally {
        running = false;
        sleepCanceller = null;
      }
    })();
  }

  async function stop(): Promise<void> {
    if (!running) return;
    stopRequested = true;
    sleepCanceller?.();
    await loopDone;
    loopDone = null;
  }

  return {
    runOnce,
    start,
    stop,
    isRunning: () => running,
  };
}

// Diff configured instances against what's in the DB. Inserts new ones,
// cascade-deletes removed ones (FK ON DELETE CASCADE wipes their prs /
// notifications / sync_state rows). Exported because it's a useful primitive
// on its own — exercised in reconciliation tests without spinning up an
// engine.
export function reconcileInstances(
  repo: Repository,
  configured: GitHubInstance[],
): { added: string[]; removed: string[] } {
  const inDb = new Set(repo.listInstanceIds());
  const inConfig = new Set(configured.map((i) => i.id));

  const added: string[] = [];
  const removed: string[] = [];

  for (const instance of configured) {
    repo.upsertInstance({
      id: instance.id,
      label: instance.label,
      baseUrl: instance.baseUrl,
      username: instance.username,
    });
    if (!inDb.has(instance.id)) added.push(instance.id);
  }

  for (const id of inDb) {
    if (!inConfig.has(id)) {
      repo.deleteInstance(id);
      removed.push(id);
    }
  }

  return { added, removed };
}

// Skip the fetch when stored headroom for this (instance, kind) is below the
// floor and reset is still in the future. Prevents the engine from burning
// the last 200 requests on a polling cycle.
async function guardedRun(
  repo: Repository,
  instanceId: string,
  kind: FetchSummary["kind"],
  fn: () => Promise<{
    count: number;
    rateRemaining: number | null;
    rateResetAt?: string;
    notModified?: boolean;
  }>,
): Promise<FetchSummary> {
  const state = repo.getSyncState(instanceId, kind);
  if (
    state?.rate_remaining != null &&
    state.rate_remaining < RATE_LIMIT_FLOOR &&
    state.rate_reset_at &&
    Date.parse(state.rate_reset_at) > Date.now()
  ) {
    return {
      kind,
      count: 0,
      rateRemaining: state.rate_remaining,
      error: `rate-limit floor (${RATE_LIMIT_FLOOR}) — waiting for reset at ${state.rate_reset_at}`,
    };
  }

  try {
    const r = await fn();
    return {
      kind,
      count: r.count,
      notModified: r.notModified,
      rateRemaining: r.rateRemaining,
      rateResetAt: r.rateResetAt ?? null,
    };
  } catch (err) {
    return {
      kind,
      count: 0,
      rateRemaining: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Sleep that resolves on either timer or the canceller being called. The
// canceller is captured so stop() can wake the loop immediately instead of
// waiting up to `intervalMs` for the next iteration.
function interruptibleSleep(
  ms: number,
  capture: (cancel: () => void) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    capture(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// Pretty-print a cycle summary. The CLI uses this; the server probably won't.
export function printSummary(summary: SyncCycleSummary): void {
  const lines: string[] = [];
  lines.push(`sync cycle ${summary.startedAt} (${summary.durationMs}ms)`);
  for (const result of summary.results) {
    lines.push(`  instance: ${result.instanceId}`);
    for (const fetch of result.fetches) {
      const status = fetch.error
        ? `ERROR ${fetch.error}`
        : fetch.notModified
          ? "304 not modified"
          : `${fetch.count} rows`;
      const rate =
        fetch.rateRemaining != null ? ` (rate ${fetch.rateRemaining})` : "";
      lines.push(`    ${fetch.kind.padEnd(18)} ${status}${rate}`);
    }
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}
