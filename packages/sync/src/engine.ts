import { createHash } from "node:crypto";
import { openCache } from "./cache/open.js";
import {
  createStore,
  type CacheMutation,
  type Kind,
  type Metadata,
  type SyncHealth,
} from "./cache/store.js";
import { authenticate, loadInstances, type GitHubInstance } from "./config.js";
import { fetchPullRequestComments } from "./providers/github/comments.js";
import { fetchAuthoredPrs } from "./providers/github/fetchPrs.js";
import {
  approvePr,
  markNotificationDone,
  togglePrAutoMerge,
  togglePrDraft,
  type PrTarget,
} from "./providers/github/prActions.js";
import { fetchReviews } from "./providers/github/fetchReviews.js";
import { fetchNotifications } from "./providers/github/fetchNotifications.js";
import {
  fetchPullRequestDiff,
  postReviewComment,
  type ReviewLineRange,
} from "./providers/github/reviewDiff.js";

export type SyncKind = Kind;
export interface SyncRequest {
  instanceId?: string;
  kinds?: SyncKind[];
}
export interface FetchOutcome {
  kind: SyncKind;
  status: "updated" | "unchanged" | "skipped" | "failed";
  count: number;
  reason?: string;
}
export interface SyncResult {
  startedAt: string;
  finishedAt: string;
  results: { instanceId: string; fetches: FetchOutcome[] }[];
}
export interface SyncOptions {
  loadInstances?: () => GitHubInstance[] | Promise<GitHubInstance[]>;
  authenticate?: (instance: GitHubInstance) => Promise<string>;
}
const KINDS: SyncKind[] = ["prs", "reviews", "notifications"];
const FLOOR = 200;

export function createSync(options: SyncOptions = {}) {
  const { db } = openCache();
  const store = createStore(db);
  let tail: Promise<unknown> = Promise.resolve();
  let localTail: Promise<unknown> = Promise.resolve();
  let closing: Promise<void> | undefined;

  const credentialKey = (i: Pick<GitHubInstance, "baseUrl" | "token">) =>
    createHash("sha256").update(`${i.baseUrl}\0${i.token}`).digest("hex");
  function reconcileConfiguration() {
    // Local config work must not wait for network requests. Serialize config
    // loads separately so a slower load cannot overwrite a newer local one.
    const work = localTail.then(async () => {
      const configured = await (options.loadInstances ?? loadInstances)();
      if (new Set(configured.map((i) => i.id)).size !== configured.length)
        throw new Error("duplicate instance ID");
      // Rotated credentials invalidate old data even when auth fails;
      // unchanged credentials keep their data through auth failures.
      store.reconcile(
        configured.map((i) => ({ ...i, credentialKey: credentialKey(i) })),
      );
      return configured;
    });
    localTail = work.catch(() => {});
    return work;
  }

  async function cycle(request: SyncRequest): Promise<SyncResult> {
    const startedAt = new Date().toISOString();
    const configured = await reconcileConfiguration();
    if (
      request.instanceId &&
      !configured.some((i) => i.id === request.instanceId)
    )
      throw new Error(`unknown instance: ${request.instanceId}`);
    const kinds = request.kinds ?? KINDS;
    if (kinds.some((k) => !KINDS.includes(k)))
      throw new Error("unknown sync kind");
    const results: SyncResult["results"] = [];
    for (const instance of configured.filter(
      (i) => !request.instanceId || i.id === request.instanceId,
    )) {
      const fetches: FetchOutcome[] = [];
      results.push({ instanceId: instance.id, fetches });
      const finish = (outcome: FetchOutcome, retryAt: string | null = null) => {
        store.recordHealth(
          instance.id,
          outcome.kind,
          {
            status: outcome.status,
            reason: outcome.reason ?? null,
            retryAt,
          },
          credentialKey(instance),
        );
        fetches.push(outcome);
      };
      let username: string;
      try {
        username = await (options.authenticate ?? authenticate)(instance);
      } catch (err) {
        for (const kind of kinds)
          finish({
            kind,
            status: "failed",
            count: 0,
            reason: message(err),
          });
        continue;
      }
      if (
        !store.updateAuthenticatedIdentity(
          instance.id,
          credentialKey(instance),
          username,
        )
      ) {
        for (const kind of kinds)
          finish({
            kind,
            status: "skipped",
            count: 0,
            reason: "identity changed during sync",
          });
        continue;
      }
      const target = { ...instance, username };
      for (const kind of kinds) {
        const resource = kind === "notifications" ? "rest" : "graphql";
        const budget = store.budget(instance.id, resource);
        if (
          budget?.remaining != null &&
          budget.remaining < FLOOR &&
          budget.reset_at &&
          Date.parse(budget.reset_at) > Date.now()
        ) {
          finish(
            {
              kind,
              status: "skipped",
              count: 0,
              reason: `rate-limit floor (${FLOOR}) until ${budget.reset_at}`,
            },
            budget.reset_at,
          );
          continue;
        }
        store.recordHealth(
          instance.id,
          kind,
          { status: "syncing", reason: null, retryAt: null },
          credentialKey(instance),
        );
        try {
          const result =
            kind === "prs"
              ? await fetchAuthoredPrs(target)
              : kind === "reviews"
                ? await fetchReviews(target)
                : await fetchNotifications(
                    target,
                    store.state(instance.id, kind)?.last_etag ?? null,
                  );
          const saved = store.save(
            instance.id,
            kind,
            result.data,
            result.metadata,
            { credentialKey: credentialKey(instance), username },
          );
          if (!saved) {
            finish({
              kind,
              status: "skipped",
              count: 0,
              reason: "identity changed during sync",
            });
            continue;
          }
          finish({
            kind,
            status: result.data === null ? "unchanged" : "updated",
            count:
              result.data?.length ??
              (kind === "notifications"
                ? store.listNotifications(instance.id).length
                : 0),
          });
        } catch (err) {
          const metadata = errorMetadata(err);
          if (metadata)
            store.recordBudget(
              instance.id,
              resource,
              metadata,
              credentialKey(instance),
            );
          finish({
            kind,
            status: "failed",
            count: 0,
            reason: message(err),
          });
        }
      }
    }
    return { startedAt, finishedAt: new Date().toISOString(), results };
  }

  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    if (closing) return Promise.reject(new Error("sync runtime is closed"));
    const work = tail.then(run);
    tail = work.catch(() => {});
    return work;
  }
  function sync(request: SyncRequest = {}): Promise<SyncResult> {
    return enqueue(() => cycle(request));
  }
  async function configuredInstance(
    instanceId: string,
  ): Promise<GitHubInstance> {
    const configured = await reconcileConfiguration();
    const instance = configured.find(
      (candidate) => candidate.id === instanceId,
    );
    if (!instance) throw new Error(`unknown instance: ${instanceId}`);
    return instance;
  }
  function getPullRequestDiff(request: {
    instanceId: string;
    repo: string;
    number: number;
  }) {
    return enqueue(async () => {
      const instance = await configuredInstance(request.instanceId);
      return fetchPullRequestDiff(instance, request.repo, request.number);
    });
  }
  function getPullRequestComments(request: {
    instanceId: string;
    repo: string;
    number: number;
  }) {
    return enqueue(async () => {
      const instance = await configuredInstance(request.instanceId);
      return fetchPullRequestComments(instance, request.repo, request.number);
    });
  }
  function createReviewComment(request: {
    instanceId: string;
    repo: string;
    number: number;
    headSha: string;
    range: ReviewLineRange;
    body: string;
  }) {
    return enqueue(async () => {
      const instance = await configuredInstance(request.instanceId);
      await postReviewComment(instance, request);
    });
  }
  // PR write actions share the queue with syncs, like review comments.
  type ActionRequest = PrTarget & { instanceId: string };
  const action =
    <T>(run: (instance: GitHubInstance, target: PrTarget) => Promise<T>) =>
    (request: ActionRequest) =>
      enqueue(async () => {
        const instance = await configuredInstance(request.instanceId);
        const result = await run(instance, {
          repo: request.repo,
          number: request.number,
        });
        if (result && typeof result === "object") {
          store.recordMutation(
            request.instanceId,
            {
              kind: "patch",
              repo: request.repo,
              number: request.number,
              patch: result,
            },
            credentialKey(instance),
          );
        }
        return result;
      });
  function close(): Promise<void> {
    if (!closing)
      closing = tail.then(async () => {
        // Queued network work may itself enqueue local reconciliation.
        await localTail;
        db.close();
      });
    return closing;
  }
  return {
    sync,
    close,
    reconcileConfiguration: () => {
      if (closing) return Promise.reject(new Error("sync runtime is closed"));
      return reconcileConfiguration().then(() => {});
    },
    getSyncState: store.state,
    getHealth: (): SyncHealth[] =>
      store
        .listInstances()
        .flatMap((instance) =>
          KINDS.map((kind) => store.health(instance.id, kind)),
        ),
    recordMutation: (
      instanceId: string,
      mutation: CacheMutation,
      expectedIdentity?: Pick<GitHubInstance, "baseUrl" | "token">,
    ) =>
      enqueue(async () => {
        const instance = await configuredInstance(instanceId);
        const key = credentialKey(instance);
        // Detailed REST actions may finish after a config reload. Their cache
        // patches belong only to the identity that performed the remote write.
        if (expectedIdentity && credentialKey(expectedIdentity) !== key) return;
        store.recordMutation(instanceId, mutation, key);
      }),
    listInstances: store.listInstances,
    listPullRequests: store.listPullRequests,
    listNotifications: store.listNotifications,
    getPullRequestDiff,
    getPullRequestComments,
    createReviewComment,
    approvePullRequest: action(approvePr),
    togglePullRequestDraft: action(togglePrDraft),
    togglePullRequestAutoMerge: action(togglePrAutoMerge),
    markNotificationDone: (request: { instanceId: string; id: string }) =>
      enqueue(async () => {
        const instance = await configuredInstance(request.instanceId);
        await markNotificationDone(instance, request.id);
        store.recordMutation(
          request.instanceId,
          {
            kind: "notificationDone",
            id: request.id,
          },
          credentialKey(instance),
        );
      }),
  };
}
function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
function errorMetadata(err: unknown): Metadata | null {
  const headers = (err as { response?: { headers?: Record<string, string> } })
    ?.response?.headers;
  if (!headers?.["x-ratelimit-remaining"]) return null;
  return {
    remaining: Number(headers["x-ratelimit-remaining"]),
    resetAt: headers["x-ratelimit-reset"]
      ? new Date(Number(headers["x-ratelimit-reset"]) * 1000).toISOString()
      : null,
  };
}
