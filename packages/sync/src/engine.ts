import { createHash } from "node:crypto";
import { openCache } from "./cache/open.js";
import { createStore, type Kind, type Metadata } from "./cache/store.js";
import { authenticate, loadInstances, type GitHubInstance } from "./config.js";
import { fetchAuthoredPrs } from "./providers/github/fetchPrs.js";
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
  let closing: Promise<void> | undefined;

  async function cycle(request: SyncRequest): Promise<SyncResult> {
    const startedAt = new Date().toISOString();
    const configured = await (options.loadInstances ?? loadInstances)();
    if (new Set(configured.map((i) => i.id)).size !== configured.length)
      throw new Error("duplicate instance ID");
    if (
      request.instanceId &&
      !configured.some((i) => i.id === request.instanceId)
    )
      throw new Error(`unknown instance: ${request.instanceId}`);
    const kinds = request.kinds ?? KINDS;
    if (kinds.some((k) => !KINDS.includes(k)))
      throw new Error("unknown sync kind");
    // Reconcile valid configuration independently of host availability. Preserve old
    // identity-specific data when authentication fails.
    store.reconcile(configured);
    const results: SyncResult["results"] = [];
    for (const instance of configured.filter(
      (i) => !request.instanceId || i.id === request.instanceId,
    )) {
      const fetches: FetchOutcome[] = [];
      results.push({ instanceId: instance.id, fetches });
      let username: string;
      try {
        username = await (options.authenticate ?? authenticate)(instance);
      } catch (err) {
        for (const kind of kinds)
          fetches.push({
            kind,
            status: "failed",
            count: 0,
            reason: message(err),
          });
        continue;
      }
      const credentialKey = createHash("sha256")
        .update(`${instance.baseUrl}\0${instance.token}`)
        .digest("hex");
      store.reconcile(
        configured.map((i) =>
          i.id === instance.id ? { ...i, username, credentialKey } : i,
        ),
      );
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
          fetches.push({
            kind,
            status: "skipped",
            count: 0,
            reason: `rate-limit floor (${FLOOR}) until ${budget.reset_at}`,
          });
          continue;
        }
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
          store.save(instance.id, kind, result.data, result.metadata);
          fetches.push({
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
          if (metadata) store.recordBudget(instance.id, resource, metadata);
          fetches.push({
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
    const configured = await (options.loadInstances ?? loadInstances)();
    if (
      new Set(configured.map((instance) => instance.id)).size !==
      configured.length
    )
      throw new Error("duplicate instance ID");
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
  function close(): Promise<void> {
    if (!closing)
      closing = tail.then(() => {
        db.close();
      });
    return closing;
  }
  return {
    sync,
    close,
    listInstances: store.listInstances,
    listPullRequests: store.listPullRequests,
    listNotifications: store.listNotifications,
    getPullRequestDiff,
    createReviewComment,
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
