export type CiStatus = "success" | "failure" | "pending" | "unknown";

export interface ReviewSummary {
  approved: string[];
  changesRequested: string[];
}

export interface PullRequest {
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
  reviewDecision: string | null;
  mergeStateStatus: string | null;
  unresolvedThreadCount: number;
  additions: number;
  deletions: number;
  commits: number;
  commentCount: number;
  labels: string[];
  mergeable: boolean | null;
  autoAssigned?: boolean;
}

export interface Notification {
  id: string;
  title: string;
  type: string | null;
  reason: string;
  repo: string;
  url: string;
  unread: boolean;
  updatedAt: string;
}
