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
export {
  lineRange,
  type DiffFile,
  type DiffLine,
  type PullRequestDiff,
  type ReviewLineRange,
} from "./providers/github/reviewDiff.js";
