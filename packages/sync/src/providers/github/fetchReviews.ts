import type { GitHubInstance } from "../../config.js";
import { getClient } from "./client.js";
import { normalizePr } from "./normalize.js";
import {
  type PrNode,
  SEARCH_REVIEWS,
  type SearchReviewsResponse,
} from "./queries.js";

export async function fetchReviews(instance: GitHubInstance) {
  const client = getClient(instance);
  const data = await client.graphql<SearchReviewsResponse>(SEARCH_REVIEWS, {
    q: `review-requested:${instance.username} type:pr state:open`,
    first: 100,
  });

  const nodes = data.search.nodes.filter((n): n is PrNode => n != null);

  return {
    data: nodes.map(normalizePr),
    metadata: {
      remaining: data.rateLimit.remaining,
      resetAt: data.rateLimit.resetAt,
    },
  };
}
