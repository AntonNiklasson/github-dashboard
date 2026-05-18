import { atomWithStorage } from "jotai/utils";

// Hide review requests where the user was attached via team membership rather
// than asked directly. Captures most CODEOWNERS auto-assignments — at the cost
// of also hiding manual team requests, which the GitHub API doesn't let us
// distinguish.
export const hideTeamReviewRequestsAtom = atomWithStorage<boolean>(
  "hideTeamReviewRequests",
  false,
);
