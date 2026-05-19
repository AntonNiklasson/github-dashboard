import { atomWithStorage } from "jotai/utils";

// When false, hide reviews where CODEOWNERS auto-attached the current user
// (directly or via a team). Manual user/team requests stay visible either
// way. Defaults to true.
export const showCodeOwnerRequestsAtom = atomWithStorage<boolean>(
  "showCodeOwnerRequests",
  true,
);
