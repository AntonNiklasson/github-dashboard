export interface Instance {
  id: string;
  label: string;
  username: string;
}

export interface PR {
  id: number;
  number: number;
  title: string;
  body: string;
  url: string;
  repo: string;
  createdAt?: string;
  updatedAt: string;
  author: string;
  authorAvatar: string;
  draft: boolean;
  merged?: boolean;
  ciStatus: string;
  inMergeQueue: boolean;
  autoMerge: boolean;
  headBranch: string;
  baseBranch: string;
  reviews: { approved: string[]; changesRequested: string[] };
  reviewDecision?: string | null;
  additions: number;
  deletions: number;
  commits: number;
  commentCount: number;
  labels: string[];
  mergeable?: boolean | null;
  instanceId?: string;
  instanceLabel?: string;
}

export interface ReviewRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  url: string;
  repo: string;
  createdAt?: string;
  updatedAt: string;
  author: string;
  authorAvatar: string;
  draft: boolean;
  merged: boolean;
  ciStatus: string;
  inMergeQueue: boolean;
  autoMerge: boolean;
  headBranch: string;
  baseBranch: string;
  reviews: { approved: string[]; changesRequested: string[] };
  reviewDecision?: string | null;
  additions: number;
  deletions: number;
  commits: number;
  commentCount: number;
  instanceId?: string;
  instanceLabel?: string;
  mergeable?: boolean | null;
}

export interface Notification {
  id: string;
  title: string;
  type: string;
  reason: string;
  repo: string;
  updatedAt: string;
  unread: boolean;
  url: string;
  instanceId?: string;
  instanceLabel?: string;
}

export interface RecentPR {
  id: number;
  number: number;
  title: string;
  url: string;
  repo: string;
  updatedAt: string;
  merged: boolean;
  headBranch?: string;
  additions?: number;
  deletions?: number;
  commits?: number;
  instanceId?: string;
  instanceLabel?: string;
}

export interface SearchPR {
  id: number;
  number: number;
  title: string;
  url: string;
  repo: string;
  updatedAt: string;
  state?: string;
}
