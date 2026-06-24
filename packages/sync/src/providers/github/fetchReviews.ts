import type { PrRow, Repository } from "../../cache/store.js";
import type { GitHubInstance } from "../../config.js";
import { getClient } from "./client.js";
import { normalizePr } from "./normalize.js";
import {
  type ReviewPrNode,
  SEARCH_REVIEWS,
  type SearchReviewsResponse,
  type TimelineEventNode,
} from "./queries.js";

export interface FetchReviewsResult {
  count: number;
  rateRemaining: number;
  rateResetAt: string;
}

export async function fetchReviews(
  repo: Repository,
  instance: GitHubInstance,
): Promise<FetchReviewsResult> {
  const client = getClient(instance);
  const data = await client.graphql<SearchReviewsResponse>(SEARCH_REVIEWS, {
    q: `review-requested:${instance.username} type:pr state:open`,
    first: 100,
  });

  const nodes = data.search.nodes.filter((n): n is ReviewPrNode => n != null);

  const rows: PrRow[] = nodes.map((node) => {
    const pr = normalizePr(node);
    const autoAssigned = detectAutoAssigned(node, instance.username);
    const payload = { ...pr, autoAssigned };
    return {
      instance_id: instance.id,
      kind: "review_requested",
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
        pr.mergeable === null
          ? null
          : pr.mergeable
            ? "MERGEABLE"
            : "CONFLICTING",
      updated_at: pr.updatedAt,
      payload: JSON.stringify(payload),
    };
  });

  repo.replacePrs(instance.id, "review_requested", rows);

  repo.upsertSyncState({
    instance_id: instance.id,
    kind: "review_requested",
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

// Auto-assigned heuristic. Auto when:
//   - The actor is a bot (__typename === "Bot" or login ends in `[bot]`), or
//   - The actor is the PR author AND the event fired within 2s of PR creation.
// We track the *current* attachment per user: the most recent review_requested
// event not superseded by a review_request_removed. When the user isn't in the
// direct requested-reviewer list (team-based attachment), fall back to: any
// auto-actor event present in the timeline. The team identity is intentionally
// not used — GraphQL's Team.slug requires read:org scope, which most tokens
// don't have, so we accept a coarser heuristic for team-based cases.
function detectAutoAssigned(node: ReviewPrNode, username: string): boolean {
  const prAuthor = node.author?.login;
  const prCreatedMs = node.createdAt ? Date.parse(node.createdAt) : null;
  const inRequestedReviewers = node.reviewRequests.nodes.some(
    (r) => r.requestedReviewer?.login === username,
  );

  const isAutoActor = (ev: TimelineEventNode | undefined): boolean => {
    if (!ev?.actor) return false;
    const actorLogin = ev.actor.login;
    if (ev.actor.__typename === "Bot" || actorLogin.endsWith("[bot]")) {
      return true;
    }
    if (!prAuthor || actorLogin !== prAuthor) return false;
    if (prCreatedMs == null) return false;
    return Math.abs(Date.parse(ev.createdAt) - prCreatedMs) <= 2000;
  };

  if (inRequestedReviewers) {
    const currentReviewerAttachment = new Map<string, TimelineEventNode>();
    for (const ev of node.timelineItems.nodes) {
      const reviewer = ev.requestedReviewer?.login;
      if (!reviewer) continue;
      if (ev.__typename === "ReviewRequestedEvent") {
        currentReviewerAttachment.set(reviewer, ev);
      } else if (ev.__typename === "ReviewRequestRemovedEvent") {
        currentReviewerAttachment.delete(reviewer);
      }
    }
    return isAutoActor(currentReviewerAttachment.get(username));
  }

  // Team-based: we can't disambiguate which team this PR was attached via, so
  // approximate: any auto-actor ReviewRequestedEvent in the timeline suggests
  // the team attachment was automatic. We intentionally don't track removals
  // here — it's a coarse heuristic for the team case.
  const teamLikeEvents = node.timelineItems.nodes.filter(
    (ev) => !ev.requestedReviewer?.login,
  );
  return teamLikeEvents.some(
    (ev) => ev.__typename === "ReviewRequestedEvent" && isAutoActor(ev),
  );
}
