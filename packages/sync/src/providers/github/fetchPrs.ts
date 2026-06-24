import type { PrRow, Repository } from "../../cache/store.js";
import type { GitHubInstance } from "../../config.js";
import { getClient } from "./client.js";
import { normalizePr } from "./normalize.js";
import { type PrNode, SEARCH_PRS, type SearchPrsResponse } from "./queries.js";

export interface FetchPrsResult {
  count: number;
  rateRemaining: number;
  rateResetAt: string;
}

export async function fetchAuthoredPrs(
  repo: Repository,
  instance: GitHubInstance,
): Promise<FetchPrsResult> {
  const client = getClient(instance);
  const data = await client.graphql<SearchPrsResponse>(SEARCH_PRS, {
    q: `author:${instance.username} type:pr state:open`,
    first: 100,
  });
  const kind = "authored";

  const nodes = data.search.nodes.filter((n): n is PrNode => n != null);
  const normalized = nodes.map(normalizePr);

  const rows: PrRow[] = normalized.map((pr) => ({
    instance_id: instance.id,
    kind,
    provider_ref: String(pr.id),
    number: pr.number,
    repo: pr.repo,
    title: pr.title,
    author: pr.author,
    draft: pr.draft ? 1 : 0,
    ci_status: pr.ciStatus,
    in_merge_queue: pr.inMergeQueue ? 1 : 0,
    auto_merge: pr.autoMerge ? 1 : 0,
    unresolved_threads: pr.unresolvedThreadCount,
    additions: pr.additions,
    deletions: pr.deletions,
    commits: pr.commits,
    comment_count: pr.commentCount,
    mergeable:
      pr.mergeable === null ? null : pr.mergeable ? "MERGEABLE" : "CONFLICTING",
    updated_at: pr.updatedAt,
    payload: JSON.stringify(pr),
  }));

  repo.replacePrs(instance.id, kind, rows);

  repo.upsertSyncState({
    instance_id: instance.id,
    kind,
    last_run_at: new Date().toISOString(),
    last_etag: null,
    last_modified: null,
    rate_remaining: data.rateLimit.remaining,
    rate_reset_at: data.rateLimit.resetAt,
  });

  return {
    count: rows.length,
    rateRemaining: data.rateLimit.remaining,
    rateResetAt: data.rateLimit.resetAt,
  };
}
