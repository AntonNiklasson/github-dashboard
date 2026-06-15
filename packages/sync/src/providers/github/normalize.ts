import type { PrNode } from "./queries.js";

export type CiStatus = "success" | "failure" | "pending" | "unknown";

export function mapCiStatus(state: string | null | undefined): CiStatus {
  switch (state) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return "unknown";
  }
}

export function mapMergeable(v: PrNode["mergeable"]): boolean | null {
  if (v === "MERGEABLE") return true;
  if (v === "CONFLICTING") return false;
  return null;
}

export interface ReviewSummary {
  approved: string[];
  changesRequested: string[];
}

export function summarizeReviews(
  reviews: PrNode["reviews"]["nodes"],
): ReviewSummary {
  const latest = new Map<string, string>();
  for (const r of reviews) {
    if (!r.author?.login) continue;
    if (r.state === "COMMENTED") continue;
    latest.set(r.author.login, r.state);
  }
  const approved: string[] = [];
  const changesRequested: string[] = [];
  for (const [user, state] of latest) {
    if (state === "APPROVED") approved.push(user);
    if (state === "CHANGES_REQUESTED") changesRequested.push(user);
  }
  return { approved, changesRequested };
}

export interface NormalizedPr {
  id: number | string;
  number: number;
  title: string;
  body: string;
  url: string;
  repo: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  authorAvatar: string;
  draft: boolean;
  ciStatus: CiStatus;
  inMergeQueue: boolean;
  autoMerge: boolean;
  autoMergeAllowed: boolean;
  headBranch: string;
  baseBranch: string;
  reviews: ReviewSummary;
  reviewDecision: PrNode["reviewDecision"];
  mergeStateStatus: PrNode["mergeStateStatus"];
  unresolvedThreadCount: number;
  additions: number;
  deletions: number;
  commits: number;
  commentCount: number;
  labels: string[];
  mergeable: boolean | null;
  autoAssigned?: boolean;
}

export function normalizePr(node: PrNode): NormalizedPr {
  const ci = mapCiStatus(
    node.commits.nodes[0]?.commit.statusCheckRollup?.state,
  );
  const unresolved = node.reviewThreads.nodes.filter(
    (t) => !t.isResolved,
  ).length;
  // Match the server payload's commentCount = conversation comments + review
  // comments. Review comments are summed across review threads. Capped at the
  // first 100 threads (the GraphQL page size) — an undercount only on PRs with
  // an unusually large number of distinct threads.
  const reviewCommentCount = node.reviewThreads.nodes.reduce(
    (sum, t) => sum + t.comments.totalCount,
    0,
  );
  return {
    id: node.databaseId ?? node.id,
    number: node.number,
    title: node.title,
    body: node.body ?? "",
    url: node.url,
    repo: node.repository.nameWithOwner,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    author: node.author?.login ?? "unknown",
    authorAvatar: node.author?.avatarUrl ?? "",
    draft: node.isDraft,
    ciStatus: ci,
    inMergeQueue: node.mergeQueueEntry != null,
    autoMerge: node.autoMergeRequest != null,
    autoMergeAllowed: node.repository.autoMergeAllowed,
    headBranch: node.headRefName,
    baseBranch: node.baseRefName,
    reviews: summarizeReviews(node.reviews.nodes),
    reviewDecision: node.reviewDecision,
    mergeStateStatus: node.mergeStateStatus,
    unresolvedThreadCount: unresolved,
    additions: node.additions,
    deletions: node.deletions,
    commits: node.commitsTotal.totalCount,
    commentCount: node.comments.totalCount + reviewCommentCount,
    labels: node.labels.nodes.map((l) => l.name),
    mergeable: mapMergeable(node.mergeable),
  };
}
