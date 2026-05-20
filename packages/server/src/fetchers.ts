import type { Octokit } from "@octokit/rest";
import { cacheAge, getCached, setCached } from "./cache.js";
import { getClient, getInstance } from "./github-client.js";

interface RepoSettings {
  autoMergeAllowed: boolean;
}

const inFlightRepoSettings = new Map<string, Promise<RepoSettings>>();
const REPO_SETTINGS_TTL_MS = 2 * 60 * 1000;

export async function getRepoSettings(
  client: Octokit,
  instanceId: string,
  owner: string,
  repo: string,
): Promise<RepoSettings> {
  const key = `${instanceId}:repo-settings:${owner}/${repo}`;
  const age = cacheAge(key);
  const cached =
    age !== null && age < REPO_SETTINGS_TTL_MS
      ? getCached<RepoSettings>(key)
      : null;
  if (cached) return cached;
  const existing = inFlightRepoSettings.get(key);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const { data } = await client.repos.get({ owner, repo });
      const settings: RepoSettings = {
        autoMergeAllowed: data.allow_auto_merge ?? false,
      };
      setCached(key, settings);
      return settings;
    } catch {
      return { autoMergeAllowed: false };
    } finally {
      inFlightRepoSettings.delete(key);
    }
  })();
  inFlightRepoSettings.set(key, promise);
  return promise;
}

type Review = { state: string; user: { login: string } | null };

interface MergeQueueInfo {
  inMergeQueue: boolean;
  autoMerge: boolean;
  reviewDecision: string | null;
  mergeStateStatus: string | null;
  unresolvedThreadCount: number;
}

export async function fetchMergeQueueStatus(
  client: Octokit,
  items: { node_id: string }[],
): Promise<Map<string, MergeQueueInfo>> {
  const result = new Map<string, MergeQueueInfo>();
  if (items.length === 0) return result;

  // Build a batched GraphQL query
  const aliases = items.map((item, i) => {
    return `pr${i}: node(id: "${item.node_id}") { ... on PullRequest { id mergeQueueEntry { id } autoMergeRequest { enabledAt } reviewDecision mergeStateStatus reviewThreads(first: 100) { nodes { isResolved } } } }`;
  });

  try {
    const response = await client.graphql<
      Record<
        string,
        {
          id: string;
          mergeQueueEntry: { id: string } | null;
          autoMergeRequest: { enabledAt: string } | null;
          reviewDecision: string | null;
          mergeStateStatus: string | null;
          reviewThreads: { nodes: { isResolved: boolean }[] } | null;
        } | null
      >
    >(`query { ${aliases.join("\n")} }`);

    for (let i = 0; i < items.length; i++) {
      const pr = response[`pr${i}`];
      const threads = pr?.reviewThreads?.nodes ?? [];
      const unresolvedThreadCount = threads.filter((t) => !t.isResolved).length;
      result.set(items[i].node_id, {
        inMergeQueue: pr?.mergeQueueEntry != null,
        autoMerge: pr?.autoMergeRequest != null,
        reviewDecision: pr?.reviewDecision ?? null,
        mergeStateStatus: pr?.mergeStateStatus ?? null,
        unresolvedThreadCount,
      });
    }
  } catch {
    // If GraphQL fails, return empty — don't break the whole fetch
  }

  return result;
}

type CheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

// listForRef can return multiple attempts of the same named check (e.g. after
// a rerun). Keep only the most recent attempt per name so a stale failure
// doesn't outvote a later success.
export function latestCheckRunsByName<T extends CheckRun>(runs: T[]): T[] {
  const latest = new Map<string, T>();
  const ts = (r: T) => {
    const t = r.completed_at ?? r.started_at;
    return t ? new Date(t).getTime() : 0;
  };
  for (const r of runs) {
    const existing = latest.get(r.name);
    if (!existing || ts(r) >= ts(existing)) {
      latest.set(r.name, r);
    }
  }
  return [...latest.values()];
}

export async function getCiStatus(
  client: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<string> {
  const [statusRes, checksRes] = await Promise.all([
    client.repos
      .getCombinedStatusForRef({ owner, repo, ref })
      .catch(() => null),
    client.checks
      .listForRef({ owner, repo, ref, per_page: 100 })
      .catch(() => null),
  ]);

  const statuses = statusRes?.data.statuses ?? [];
  const checkRuns = latestCheckRunsByName(checksRes?.data.check_runs ?? []);

  // No CI configured at all
  if (statuses.length === 0 && checkRuns.length === 0) return "unknown";

  // Check if anything is still running
  const hasRunning = checkRuns.some((cr) => cr.status !== "completed");
  if (hasRunning) return "pending";

  // Check for failures
  const hasStatusFailure = statuses.some(
    (s) => s.state === "failure" || s.state === "error",
  );
  const hasCheckFailure = checkRuns.some(
    (cr) =>
      cr.conclusion === "failure" ||
      cr.conclusion === "timed_out" ||
      cr.conclusion === "cancelled",
  );
  if (hasStatusFailure || hasCheckFailure) return "failure";

  // If everything completed successfully
  return "success";
}

export function summarizeReviews(reviews: Review[]) {
  const latest = new Map<string, string>();
  for (const r of reviews) {
    if (!r.user) continue;
    if (r.state === "COMMENTED") continue;
    latest.set(r.user.login, r.state);
  }

  const approved: string[] = [];
  const changesRequested: string[] = [];

  for (const [user, state] of latest) {
    if (state === "APPROVED") approved.push(user);
    if (state === "CHANGES_REQUESTED") changesRequested.push(user);
  }

  return { approved, changesRequested };
}

export async function fetchPrs(instanceId: string) {
  const client = await getClient(instanceId);
  const { username } = await getInstance(instanceId);

  const { data } = await client.search.issuesAndPullRequests({
    q: `author:${username} type:pr state:open`,
    sort: "updated",
    order: "desc",
    per_page: 30,
  });

  // Batch GraphQL query for merge queue + auto-merge status
  const mergeQueueStatus = await fetchMergeQueueStatus(client, data.items);

  const prs = await Promise.all(
    data.items.map(async (item) => {
      const [owner, repo] = item.repository_url.split("/").slice(-2);
      const prNumber = item.number;

      const [ciStatus, reviewsRes, prRes, repoSettings] = await Promise.all([
        getCiStatus(client, owner, repo, `pull/${prNumber}/head`),
        client.pulls
          .listReviews({ owner, repo, pull_number: prNumber })
          .catch(() => null),
        client.pulls
          .get({ owner, repo, pull_number: prNumber })
          .catch(() => null),
        getRepoSettings(client, instanceId, owner, repo),
      ]);

      const reviews = reviewsRes?.data ?? [];
      const prData = prRes?.data;
      const mqStatus = mergeQueueStatus.get(item.node_id);

      return {
        id: item.id,
        number: prNumber,
        title: item.title,
        body: prData?.body ?? "",
        url: item.html_url,
        repo: `${owner}/${repo}`,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        author: item.user?.login ?? "unknown",
        authorAvatar: item.user?.avatar_url ?? "",
        draft: item.draft ?? false,
        // Not applicable for open PRs
        ciStatus,
        inMergeQueue: mqStatus?.inMergeQueue ?? false,
        autoMerge: mqStatus?.autoMerge ?? false,
        autoMergeAllowed: repoSettings.autoMergeAllowed,
        headBranch: prData?.head.ref ?? "",
        baseBranch: prData?.base.ref ?? "main",
        reviews: summarizeReviews(reviews),
        reviewDecision: mqStatus?.reviewDecision ?? null,
        mergeStateStatus: mqStatus?.mergeStateStatus ?? null,
        unresolvedThreadCount: mqStatus?.unresolvedThreadCount ?? 0,
        additions: prData?.additions ?? 0,
        deletions: prData?.deletions ?? 0,
        commits: prData?.commits ?? 0,
        commentCount: (prData?.comments ?? 0) + (prData?.review_comments ?? 0),
        labels: item.labels.map((l) =>
          typeof l === "string" ? l : (l.name ?? ""),
        ),
        mergeable: prData?.mergeable ?? null,
      };
    }),
  );

  // Filter to only include PRs where the author matches the configured username
  return prs.filter((pr) => pr.author === username);
}

export async function fetchReviews(instanceId: string) {
  const client = await getClient(instanceId);
  const { username } = await getInstance(instanceId);

  const { data } = await client.search.issuesAndPullRequests({
    q: `review-requested:${username} type:pr state:open`,
    sort: "updated",
    order: "desc",
    per_page: 30,
  });

  const mergeQueueStatus = await fetchMergeQueueStatus(client, data.items);

  return Promise.all(
    data.items.map(async (item) => {
      const [owner, repo] = item.repository_url.split("/").slice(-2);
      const prNumber = item.number;

      // autoAssigned only changes when the PR changes (push, comment, review,
      // CODEOWNERS re-eval all bump updated_at). Cache by (instance, repo,
      // number) and re-fetch the timeline only when updated_at moves.
      const autoCacheKey = `${instanceId}:auto-assigned:${owner}/${repo}/${prNumber}`;
      const cachedAuto = getCached<{ value: boolean; updatedAt: string }>(
        autoCacheKey,
      );
      const useCachedAuto = cachedAuto?.updatedAt === item.updated_at;

      const [ciStatus, reviewsRes, prRes, timelineRes] = await Promise.all([
        getCiStatus(client, owner, repo, `pull/${prNumber}/head`),
        client.pulls
          .listReviews({ owner, repo, pull_number: prNumber })
          .catch(() => null),
        client.pulls
          .get({ owner, repo, pull_number: prNumber })
          .catch(() => null),
        useCachedAuto
          ? Promise.resolve(null)
          : client.issues
              .listEventsForTimeline({
                owner,
                repo,
                issue_number: prNumber,
                per_page: 100,
              })
              .catch(() => null),
      ]);

      const reviews = reviewsRes?.data ?? [];
      const prData = prRes?.data;
      const mqStatus = mergeQueueStatus.get(item.node_id);

      // A review request counts as automatic when either:
      //   - the actor is a bot (login ends in `[bot]` or type is "Bot"), or
      //   - the actor is the PR author AND the event fired at the same time
      //     as the PR was opened (within 2s).
      // Manual requests by the PR author (later clicks of "Request review")
      // share the actor but not the timing, so they correctly stay visible.
      //
      // We classify the *current* attachment per reviewer/team — i.e. the most
      // recent `review_requested` event not superseded by a
      // `review_request_removed`. This way a CODEOWNERS auto-attach that was
      // removed and then manually re-requested is correctly counted as manual.
      let autoAssigned: boolean;
      if (useCachedAuto && cachedAuto) {
        autoAssigned = cachedAuto.value;
      } else {
        const prAuthor = item.user?.login;
        const prCreatedMs = item.created_at
          ? Date.parse(item.created_at)
          : null;
        const inRequestedReviewers =
          prData?.requested_reviewers?.some((r) => r?.login === username) ??
          false;
        type TimelineEvent = {
          event?: string;
          created_at?: string;
          actor?: { login?: string; type?: string } | null;
          requested_reviewer?: { login?: string } | null;
          requested_team?: { slug?: string } | null;
        };
        const timelineEvents = (timelineRes?.data ?? []) as TimelineEvent[];
        const isAutoActor = (
          actor: { login?: string; type?: string } | null | undefined,
          eventCreatedAt?: string,
        ) => {
          if (!actor?.login) return false;
          if (actor.type === "Bot" || actor.login.endsWith("[bot]"))
            return true;
          if (!prAuthor || actor.login !== prAuthor) return false;
          if (prCreatedMs == null || !eventCreatedAt) return false;
          return Math.abs(Date.parse(eventCreatedAt) - prCreatedMs) <= 2000;
        };
        // Walk in chronological order (the timeline API returns events in
        // order). The latest `review_requested` not followed by a matching
        // `review_request_removed` is the current attachment.
        const currentReviewerAttachment = new Map<string, TimelineEvent>();
        const currentTeamAttachment = new Map<string, TimelineEvent>();
        for (const ev of timelineEvents) {
          const reviewer = ev.requested_reviewer?.login;
          const team = ev.requested_team?.slug;
          if (ev.event === "review_requested") {
            if (reviewer) currentReviewerAttachment.set(reviewer, ev);
            if (team) currentTeamAttachment.set(team, ev);
          } else if (ev.event === "review_request_removed") {
            if (reviewer) currentReviewerAttachment.delete(reviewer);
            if (team) currentTeamAttachment.delete(team);
          }
        }
        if (inRequestedReviewers) {
          const ev = currentReviewerAttachment.get(username);
          autoAssigned = ev != null && isAutoActor(ev.actor, ev.created_at);
        } else {
          autoAssigned = [...currentTeamAttachment.values()].some((ev) =>
            isAutoActor(ev.actor, ev.created_at),
          );
        }
        // Only persist when the timeline fetch actually succeeded — a 404 /
        // throttle shouldn't burn a "false" into the cache and shadow a real
        // auto-assignment.
        if (timelineRes != null) {
          setCached(autoCacheKey, {
            value: autoAssigned,
            updatedAt: item.updated_at,
          });
        }
      }

      return {
        id: item.id,
        number: prNumber,
        title: item.title,
        body: prData?.body ?? "",
        url: item.html_url,
        repo: `${owner}/${repo}`,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        author: item.user?.login ?? "unknown",
        authorAvatar: item.user?.avatar_url ?? "",
        draft: item.draft ?? false,
        // Not applicable for open PRs
        ciStatus,
        inMergeQueue: mqStatus?.inMergeQueue ?? false,
        autoMerge: mqStatus?.autoMerge ?? false,
        headBranch: prData?.head.ref ?? "",
        baseBranch: prData?.base.ref ?? "main",
        reviews: summarizeReviews(reviews),
        reviewDecision: mqStatus?.reviewDecision ?? null,
        mergeStateStatus: mqStatus?.mergeStateStatus ?? null,
        unresolvedThreadCount: mqStatus?.unresolvedThreadCount ?? 0,
        additions: prData?.additions ?? 0,
        deletions: prData?.deletions ?? 0,
        commits: prData?.commits ?? 0,
        commentCount: (prData?.comments ?? 0) + (prData?.review_comments ?? 0),
        mergeable: prData?.mergeable ?? null,
        // True when CODEOWNERS auto-attached this user (directly or via a
        // team). Manual user/team requests stay false.
        autoAssigned,
      };
    }),
  );
}

// Convert a GitHub *API* URL (e.g. https://api.github.com/repos/o/r/pulls/1)
// into its corresponding *HTML* URL (https://github.com/o/r/pull/1).
// The notifications API returns the subject's API URL on `subject.url` and
// doesn't include an `html_url`, so we have to derive it ourselves.
//
// When `latestCommentUrl` is set, we append the matching fragment so the
// link opens at the comment (e.g. #issuecomment-123) rather than the top
// of the thread.
//
// Handles github.com and GHES (where the API lives under `/api/v3`).
// For subjects that don't have a usable URL (e.g. Discussion) or types we
// can't address precisely (Release IDs aren't routable in the UI), we fall
// back to a sensible repo-level page.
export function notificationHtmlUrl(
  apiUrl: string | null | undefined,
  type: string | null | undefined,
  repoFullName: string,
  apiBaseUrl: string,
  latestCommentUrl?: string | null,
): string {
  const htmlBase = htmlBaseFromApiBase(apiBaseUrl);
  const repoUrl = `${htmlBase}/${repoFullName}`;

  if (!apiUrl) {
    if (type === "Discussion") return `${repoUrl}/discussions`;
    if (type === "Release") return `${repoUrl}/releases`;
    return repoUrl;
  }

  let path: string;
  try {
    path = new URL(apiUrl).pathname;
  } catch {
    return repoUrl;
  }

  path = path.replace(/^\/api\/v3\/repos\//, "/").replace(/^\/repos\//, "/");
  path = path
    .replace(/^\/([^/]+\/[^/]+)\/pulls\//, "/$1/pull/")
    .replace(/^\/([^/]+\/[^/]+)\/commits\//, "/$1/commit/");
  // Release notification subjects point at /releases/{id}, which the GitHub
  // UI doesn't route. Fall back to the repo's releases list — the comment
  // fragment isn't meaningful on that page either.
  const releaseMatch = path.match(/^\/([^/]+\/[^/]+)\/releases\/\d+$/);
  if (releaseMatch) return `${htmlBase}/${releaseMatch[1]}/releases`;

  const fragment = commentFragment(latestCommentUrl);
  return `${htmlBase}${path}${fragment ?? ""}`;
}

// Map a comment's API URL to the matching HTML page fragment so the link
// scrolls to the comment. Returns null for shapes we don't recognise — the
// caller then renders the bare thread URL.
function commentFragment(
  commentApiUrl: string | null | undefined,
): string | null {
  if (!commentApiUrl) return null;
  let path: string;
  try {
    path = new URL(commentApiUrl).pathname;
  } catch {
    return null;
  }
  path = path.replace(/^\/api\/v3/, "");
  let m: RegExpMatchArray | null;
  if ((m = path.match(/\/issues\/comments\/(\d+)$/)))
    return `#issuecomment-${m[1]}`;
  if ((m = path.match(/\/pulls\/comments\/(\d+)$/)))
    return `#discussion_r${m[1]}`;
  if ((m = path.match(/\/repos\/[^/]+\/[^/]+\/comments\/(\d+)$/)))
    return `#commitcomment-${m[1]}`;
  return null;
}

function htmlBaseFromApiBase(apiBaseUrl: string): string {
  try {
    const u = new URL(apiBaseUrl);
    if (u.hostname === "api.github.com") return "https://github.com";
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://github.com";
  }
}

// Notifications already represented elsewhere in the dashboard (My work,
// Reviews, the PR itself) or that are pure noise. Dropping them at the
// fetcher keeps the Notifications column focused on things that aren't
// surfaced anywhere else.
type NotificationShape = {
  reason: string;
  subject: { type: string | null };
};

const redundantRules: ReadonlyArray<(n: NotificationShape) => boolean> = [
  // shown in the Reviews column
  (n) => n.reason === "review_requested",
  // visible on the PR itself
  (n) => n.reason === "ci_activity",
  // your own PR, shown in My work
  (n) => n.subject.type === "PullRequest" && n.reason === "author",
  // your own PR, shown in My work / Reviews
  (n) => n.subject.type === "PullRequest" && n.reason === "state_change",
  // auto-subscription noise
  (n) => n.reason === "subscribed",
];

function isRedundantNotification(n: NotificationShape): boolean {
  return redundantRules.some((rule) => rule(n));
}

// We pull a few pages so the filter has enough raw material — many items
// are dropped as redundant (review_requested, ci_activity, …), and a single
// page often leaves the kept set sparse. Pages are fetched in parallel; the
// result is cached, so this only fires on cache miss / explicit refresh.
const NOTIFICATION_PAGES = 3;
const NOTIFICATIONS_PER_PAGE = 50;

export async function fetchNotifications(instanceId: string) {
  const client = await getClient(instanceId);
  const { baseUrl } = await getInstance(instanceId);

  const pages = await Promise.all(
    Array.from({ length: NOTIFICATION_PAGES }, (_, i) =>
      client.activity.listNotificationsForAuthenticatedUser({
        all: true,
        per_page: NOTIFICATIONS_PER_PAGE,
        page: i + 1,
      }),
    ),
  );
  const data = pages.flatMap((r) => r.data);

  return data
    .filter((n) => !isRedundantNotification(n))
    .map((n) => ({
      id: n.id,
      title: n.subject.title,
      type: n.subject.type,
      reason: n.reason,
      repo: n.repository.full_name,
      updatedAt: n.updated_at,
      unread: n.unread,
      url: notificationHtmlUrl(
        n.subject.url,
        n.subject.type,
        n.repository.full_name,
        baseUrl,
        n.subject.latest_comment_url,
      ),
    }));
}
