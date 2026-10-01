import type { GitHubInstance } from "../../config.js";
import { getClient } from "./client.js";
import { splitRepo } from "./reviewDiff.js";

// Conversation + inline review comments, like the server's comments route
// (packages/server/src/routes.ts). Fetched on demand, not cached.
export interface PrComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  /** Set for inline review comments. */
  path: string | null;
  line: number | null;
  /** Review comment this one replies to (thread root), if any. */
  inReplyToId: number | null;
}

export async function fetchPullRequestComments(
  instance: GitHubInstance,
  repo: string,
  number: number,
): Promise<PrComment[]> {
  const [owner, name] = splitRepo(repo);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error("invalid pull request number");
  const client = getClient(instance);
  const [issueComments, reviewComments] = await Promise.all([
    client.paginate(client.issues.listComments, {
      owner,
      repo: name,
      issue_number: number,
      per_page: 100,
    }),
    client.paginate(client.pulls.listReviewComments, {
      owner,
      repo: name,
      pull_number: number,
      per_page: 100,
    }),
  ]);
  return [
    ...issueComments.map((c) => ({
      id: c.id,
      author: c.user?.login ?? "unknown",
      body: c.body ?? "",
      createdAt: c.created_at,
      path: null,
      line: null,
      inReplyToId: null,
    })),
    ...reviewComments.map((c) => ({
      id: c.id,
      author: c.user?.login ?? "unknown",
      body: c.body,
      createdAt: c.created_at,
      path: c.path,
      line: c.line ?? c.original_line ?? null,
      inReplyToId: c.in_reply_to_id ?? null,
    })),
  ].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
