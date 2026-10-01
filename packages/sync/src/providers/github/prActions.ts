import type { GitHubInstance } from "../../config.js";
import { getClient } from "./client.js";
import { splitRepo } from "./reviewDiff.js";

// PR write actions, mirroring the server routes (packages/server/src/routes.ts).
// Toggles read current state from GitHub at call time rather than trusting the
// (possibly stale) cache, and return the new state.
export interface PrTarget {
  repo: string;
  number: number;
}

async function current(instance: GitHubInstance, target: PrTarget) {
  const [owner, repo] = splitRepo(target.repo);
  if (!Number.isSafeInteger(target.number) || target.number < 1)
    throw new Error("invalid pull request number");
  const client = getClient(instance);
  const { data } = await client.pulls.get({
    owner,
    repo,
    pull_number: target.number,
  });
  return { client, owner, repo, pr: data };
}

export async function approvePr(
  instance: GitHubInstance,
  target: PrTarget,
): Promise<void> {
  const { client, owner, repo } = await current(instance, target);
  await client.pulls.createReview({
    owner,
    repo,
    pull_number: target.number,
    event: "APPROVE",
  });
}

export async function togglePrDraft(
  instance: GitHubInstance,
  target: PrTarget,
): Promise<{ draft: boolean }> {
  const { client, pr } = await current(instance, target);
  if (pr.draft) {
    await client.graphql(
      `mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`,
      { id: pr.node_id },
    );
    return { draft: false };
  }
  await client.graphql(
    `mutation($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`,
    { id: pr.node_id },
  );
  return { draft: true };
}

export async function togglePrAutoMerge(
  instance: GitHubInstance,
  target: PrTarget,
): Promise<{ autoMerge: boolean }> {
  const { client, pr } = await current(instance, target);
  if (pr.auto_merge) {
    await client.graphql(
      `mutation($id: ID!) { disablePullRequestAutoMerge(input: { pullRequestId: $id }) { pullRequest { id } } }`,
      { id: pr.node_id },
    );
    return { autoMerge: false };
  }
  if (pr.draft) throw new Error("auto-merge can't be enabled on a draft PR");
  try {
    // Squash, same as the server and web app.
    await client.graphql(
      `mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { pullRequest { id } } }`,
      { id: pr.node_id },
    );
  } catch (err) {
    if (err instanceof Error && /auto.?merge is not allowed/i.test(err.message))
      throw new Error("auto-merge is not allowed for this repository");
    throw err;
  }
  return { autoMerge: true };
}

// GitHub's inbox "Done": archives the thread until new activity revives it
// (unlike "read", which keeps it listed). Same call as the server route.
export async function markNotificationDone(
  instance: GitHubInstance,
  threadId: string,
): Promise<void> {
  if (!/^\d+$/.test(threadId)) throw new Error("invalid notification id");
  await getClient(instance).activity.markThreadAsDone({
    thread_id: Number(threadId),
  });
}
