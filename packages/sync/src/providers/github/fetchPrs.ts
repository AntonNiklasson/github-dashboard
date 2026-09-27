import type { GitHubInstance } from "../../config.js";
import { getClient } from "./client.js";
import { normalizePr } from "./normalize.js";
import { type PrNode, SEARCH_PRS, type SearchPrsResponse } from "./queries.js";

export async function fetchAuthoredPrs(instance: GitHubInstance) {
  const client = getClient(instance);
  const data = await client.graphql<SearchPrsResponse>(SEARCH_PRS, {
    q: `author:${instance.username} type:pr state:open`,
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
