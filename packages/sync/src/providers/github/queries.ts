export const PR_FIELDS = /* GraphQL */ `
  fragment PrFields on PullRequest {
    id
    databaseId
    number
    title
    body
    url
    createdAt
    updatedAt
    isDraft
    mergeable
    mergeStateStatus
    reviewDecision
    additions
    deletions
    headRefName
    baseRefName
    author {
      login
      avatarUrl
    }
    repository {
      nameWithOwner
      autoMergeAllowed
    }
    commits(last: 1) {
      nodes {
        commit {
          statusCheckRollup {
            state
          }
        }
      }
    }
    reviews(last: 50) {
      nodes {
        state
        author {
          login
        }
      }
    }
    reviewThreads(first: 100) {
      totalCount
      nodes {
        isResolved
        comments {
          totalCount
        }
      }
    }
    autoMergeRequest {
      enabledAt
    }
    mergeQueueEntry {
      id
    }
    labels(first: 20) {
      nodes {
        name
      }
    }
    comments {
      totalCount
    }
    commitsTotal: commits {
      totalCount
    }
  }
`;

export const SEARCH_PRS = /* GraphQL */ `
  ${PR_FIELDS}
  query ($q: String!, $first: Int!) {
    search(query: $q, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          ...PrFields
        }
      }
    }
    rateLimit {
      cost
      remaining
      resetAt
    }
  }
`;

export interface RateLimitInfo {
  cost: number;
  remaining: number;
  resetAt: string;
}

export interface PrNode {
  id: string;
  databaseId: number | null;
  number: number;
  title: string;
  body: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN" | null;
  mergeStateStatus:
    | "BEHIND"
    | "BLOCKED"
    | "CLEAN"
    | "DIRTY"
    | "DRAFT"
    | "HAS_HOOKS"
    | "UNKNOWN"
    | "UNSTABLE"
    | null;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  additions: number;
  deletions: number;
  headRefName: string;
  baseRefName: string;
  author: { login: string; avatarUrl: string } | null;
  repository: { nameWithOwner: string; autoMergeAllowed: boolean };
  commits: {
    nodes: Array<{
      commit: {
        statusCheckRollup: { state: string } | null;
      };
    }>;
  };
  reviews: {
    nodes: Array<{ state: string; author: { login: string } | null }>;
  };
  reviewThreads: {
    totalCount: number;
    nodes: Array<{ isResolved: boolean; comments: { totalCount: number } }>;
  };
  autoMergeRequest: { enabledAt: string } | null;
  mergeQueueEntry: { id: string } | null;
  labels: { nodes: Array<{ name: string }> };
  comments: { totalCount: number };
  commitsTotal: { totalCount: number };
}

export interface SearchPrsResponse {
  search: { nodes: Array<PrNode | null> };
  rateLimit: RateLimitInfo;
}

export const SEARCH_REVIEWS = /* GraphQL */ `
  ${PR_FIELDS}
  query ($q: String!, $first: Int!) {
    search(query: $q, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          ...PrFields
          reviewRequests(first: 50) {
            nodes {
              requestedReviewer {
                __typename
                ... on User { login }
              }
            }
          }
          timelineItems(
            itemTypes: [REVIEW_REQUESTED_EVENT, REVIEW_REQUEST_REMOVED_EVENT]
            first: 100
          ) {
            nodes {
              __typename
              ... on ReviewRequestedEvent {
                createdAt
                actor {
                  __typename
                  login
                }
                requestedReviewer {
                  __typename
                  ... on User { login }
                }
              }
              ... on ReviewRequestRemovedEvent {
                createdAt
                actor {
                  __typename
                  login
                }
                requestedReviewer {
                  __typename
                  ... on User { login }
                }
              }
            }
          }
        }
      }
    }
    rateLimit {
      cost
      remaining
      resetAt
    }
  }
`;

export interface ReviewRequestedReviewer {
  __typename: "User" | "Team" | string;
  login?: string;
}

export interface TimelineEventNode {
  __typename: "ReviewRequestedEvent" | "ReviewRequestRemovedEvent";
  createdAt: string;
  actor: { __typename: string; login: string } | null;
  requestedReviewer: ReviewRequestedReviewer | null;
}

export interface ReviewPrNode extends PrNode {
  reviewRequests: {
    nodes: Array<{ requestedReviewer: ReviewRequestedReviewer | null }>;
  };
  timelineItems: { nodes: TimelineEventNode[] };
}

export interface SearchReviewsResponse {
  search: { nodes: Array<ReviewPrNode | null> };
  rateLimit: RateLimitInfo;
}
