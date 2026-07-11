import { openCache } from "./cache/open.js";
import { type Repository, createSqliteRepository } from "./cache/store.js";
import {
  type SyncCycleSummary,
  type SyncEngine,
  type SyncKind,
  createSyncEngine,
} from "./engine.js";
import type { Notification, PullRequest } from "./models.js";

export interface SyncService {
  listAuthoredPullRequests(instanceId: string): PullRequest[];
  listReviewRequests(instanceId: string): PullRequest[];
  listNotifications(instanceId: string): Notification[];

  sync(request?: SyncRequest): Promise<SyncCycleSummary>;
  requestSync(request?: SyncRequest): void;

  start(options?: StartSyncOptions): void;
  stop(): Promise<void>;
  close(): Promise<void>;
  isRunning(): boolean;
}

export interface SyncRequest {
  instanceId?: string;
  kind?: SyncKind;
}

export interface StartSyncOptions {
  intervalMs?: number;
  onCycle?: (summary: SyncCycleSummary) => void;
  onError?: (error: unknown) => void;
}

export interface CreateSyncServiceOptions {
  /** Receives failures from fire-and-forget requestSync calls. */
  onBackgroundError?: (error: unknown) => void;
}

interface SyncServiceDependencies {
  repo: Repository;
  engine: SyncEngine;
  closeStorage: () => void;
  onBackgroundError: (error: unknown) => void;
}

export function createSyncService(
  options: CreateSyncServiceOptions = {},
): SyncService {
  const { db } = openCache();
  const repo = createSqliteRepository(db);
  const engine = createSyncEngine({ repo });

  return createSyncServiceFromDependencies({
    repo,
    engine,
    // The public service intentionally hides cache diagnostics. Internal
    // composition roots such as the CLI can use the dependency seam below.
    closeStorage: () => db.close(),
    onBackgroundError:
      options.onBackgroundError ??
      ((error) => console.error("Background sync failed:", error)),
  });
}

/** Internal composition seam used by focused service tests. */
export function createSyncServiceFromDependencies(
  dependencies: SyncServiceDependencies,
): SyncService {
  const { repo, engine, closeStorage, onBackgroundError } = dependencies;
  const pending = new Set<Promise<void>>();
  let closed = false;

  function assertOpen(): void {
    if (closed) throw new Error("SyncService is closed");
  }

  function listPullRequests(
    instanceId: string,
    kind: "authored" | "review_requested",
  ): PullRequest[] {
    assertOpen();
    return repo.getPrPayloads(instanceId, kind) as PullRequest[];
  }

  const engineOptions = (request: SyncRequest | undefined) =>
    request ? { instance: request.instanceId, kind: request.kind } : undefined;

  async function waitForPending(): Promise<void> {
    while (pending.size > 0) await Promise.all(pending);
  }

  async function stop(): Promise<void> {
    if (closed) return;
    await engine.stop();
    await waitForPending();
  }

  return {
    listAuthoredPullRequests: (instanceId) =>
      listPullRequests(instanceId, "authored"),
    listReviewRequests: (instanceId) =>
      listPullRequests(instanceId, "review_requested"),
    listNotifications: (instanceId) => {
      assertOpen();
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
    },
    sync: (request) => {
      assertOpen();
      return engine.runOnce(engineOptions(request));
    },
    requestSync: (request) => {
      assertOpen();
      let tracked: Promise<void>;
      tracked = engine
        .runOnce(engineOptions(request))
        .then(
          () => undefined,
          (error) => {
            try {
              onBackgroundError(error);
            } catch (handlerError) {
              console.error(
                "Background sync error handler failed:",
                handlerError,
              );
            }
          },
        )
        .finally(() => pending.delete(tracked));
      pending.add(tracked);
    },
    start: (options) => {
      assertOpen();
      engine.start(options);
    },
    stop,
    close: async () => {
      if (closed) return;
      closed = true;
      const results = await Promise.allSettled([
        engine.stop(),
        waitForPending(),
      ]);
      closeStorage();
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failure) throw failure.reason;
    },
    isRunning: () => !closed && engine.isRunning(),
  };
}
