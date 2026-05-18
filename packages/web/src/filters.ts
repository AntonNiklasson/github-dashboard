import { atomWithStorage } from "jotai/utils";

// Show review requests where the user was attached via team membership rather
// than asked directly. Off catches most CODEOWNERS auto-assignments — at the
// cost of also hiding manual team requests, which the GitHub API doesn't let
// us distinguish.
export const showTeamReviewRequestsAtom = atomWithStorage<boolean>(
  "showTeamReviewRequests",
  true,
);
