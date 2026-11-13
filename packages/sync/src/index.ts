export {
  createSync,
  type SyncRequest,
  type SyncResult,
  type SyncKind,
  type FetchOutcome,
  type SyncOptions,
} from "./engine.js";
export type { Instance, Notification } from "./cache/store.js";
export type { NormalizedPr } from "./providers/github/normalize.js";
export type { PrComment } from "./providers/github/comments.js";
export {
  lineRange,
  type DiffFile,
  type DiffLine,
  type PullRequestDiff,
  type ReviewLineRange,
} from "./providers/github/reviewDiff.js";

export type { CacheMutation, PullRequestPatch } from "./cache/store.js";

export { authenticate } from "./config.js";

export type { SyncHealth } from "./cache/store.js";
