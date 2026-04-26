import type { Octokit } from "@octokit/rest";
import { getClient, getInstance } from "./github-client.js";

type Review = { state: string; user: { login: string } | null };

interface MergeQueueInfo {
  inMergeQueue: boolean;
  autoMerge: boolean;
  reviewDecision: string | null;
}

export async function fetchMergeQueueStatus(
  client: Octokit,
  items: { node_id: string }[],
): Promise<Map<string, MergeQueueInfo>> {
  const result = new Map<string, MergeQueueInfo>();
  if (items.length === 0) return result;

  // Build a batched GraphQL query
  const aliases = items.map((item, i) => {
    return `pr${i}: node(id: "${item.node_id}") { ... on PullRequest { id mergeQueueEntry { id } autoMergeRequest { enabledAt } reviewDecision } }`;
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
        } | null
      >
    >(`query { ${aliases.join("\n")} }`);

    for (let i = 0; i < items.length; i++) {
      const pr = response[`pr${i}`];
      result.set(items[i].node_id, {
        inMergeQueue: pr?.mergeQueueEntry != null,
        autoMerge: pr?.autoMergeRequest != null,
        reviewDecision: pr?.reviewDecision ?? null,
      });
    }
  } catch {
    // If GraphQL fails, return empty — don't break the whole fetch
  }

  return result;
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
  const checkRuns = checksRes?.data.check_runs ?? [];

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

      const [ciStatus, reviewsRes, prRes] = await Promise.all([
        getCiStatus(client, owner, repo, `pull/${prNumber}/head`),
        client.pulls
          .listReviews({ owner, repo, pull_number: prNumber })
          .catch(() => null),
        client.pulls
          .get({ owner, repo, pull_number: prNumber })
          .catch(() => null),
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
        headBranch: prData?.head.ref ?? "",
        baseBranch: prData?.base.ref ?? "main",
        reviews: summarizeReviews(reviews),
        reviewDecision: mqStatus?.reviewDecision ?? null,
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

export async function fetchRecentPrs(instanceId: string) {
  const client = await getClient(instanceId);
  const { username } = await getInstance(instanceId);

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data } = await client.search.issuesAndPullRequests({
    q: `author:${username} type:pr state:closed closed:>=${weekAgo}`,
    sort: "updated",
    order: "desc",
    per_page: 20,
  });

  // Fetch detailed PR data for each result
  const prs = await Promise.all(
    data.items.map(async (item) => {
      const [owner, repo] = item.repository_url.split("/").slice(-2);
      const prNumber = item.number;

      const prRes = await client.pulls
        .get({ owner, repo, pull_number: prNumber })
        .catch(() => null);

      const prData = prRes?.data;

      return {
        id: item.id,
        number: item.number,
        title: item.title,
        url: item.html_url,
        repo: `${owner}/${repo}`,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        merged: item.pull_request?.merged_at != null,
        headBranch: prData?.head.ref ?? "",
        additions: prData?.additions ?? 0,
        deletions: prData?.deletions ?? 0,
        commits: prData?.commits ?? 0,
      };
    }),
  );

  return prs;
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

      const [ciStatus, reviewsRes, prRes] = await Promise.all([
        getCiStatus(client, owner, repo, `pull/${prNumber}/head`),
        client.pulls
          .listReviews({ owner, repo, pull_number: prNumber })
          .catch(() => null),
        client.pulls
          .get({ owner, repo, pull_number: prNumber })
          .catch(() => null),
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
        headBranch: prData?.head.ref ?? "",
        baseBranch: prData?.base.ref ?? "main",
        reviews: summarizeReviews(reviews),
        reviewDecision: mqStatus?.reviewDecision ?? null,
        additions: prData?.additions ?? 0,
        deletions: prData?.deletions ?? 0,
        commits: prData?.commits ?? 0,
        commentCount: (prData?.comments ?? 0) + (prData?.review_comments ?? 0),
        mergeable: prData?.mergeable ?? null,
      };
    }),
  );
}

export async function fetchNotifications(instanceId: string) {
  const client = await getClient(instanceId);

  const { data } = await client.activity.listNotificationsForAuthenticatedUser({
    all: true,
    per_page: 30,
  });

  return data
    .filter((n) => n.reason !== "review_requested")
    .map((n) => ({
      id: n.id,
      title: n.subject.title,
      type: n.subject.type,
      reason: n.reason,
      repo: n.repository.full_name,
      updatedAt: n.updated_at,
      unread: n.unread,
      url: n.subject.url,
    }));
}
