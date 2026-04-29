// Pure decision logic for what pressing M on a PR should do.
// Kept free of React/DOM/mutation concerns so the branches are unit-testable;
// callers (App.tsx) translate the decision into confirm() + mutation calls.

export interface MergeInput {
  autoMerge?: boolean;
  autoMergeAllowed?: boolean;
  // GraphQL mergeStateStatus; CLEAN means every gate is satisfied right now.
  mergeStateStatus?: string | null;
}

export type MergeDecision =
  | { kind: "disable_auto_merge" }
  | { kind: "merge"; prompt: string }
  | { kind: "arm_auto_merge"; prompt: string };

export const STALE_CACHE_RECOVERY_PROMPT =
  "Auto-merge is not enabled on this repo. Merge directly?";

export function decideMergeAction(item: MergeInput): MergeDecision {
  // Disabling auto-merge is the reversal — caller treats this as silent.
  if (item.autoMerge) return { kind: "disable_auto_merge" };

  // Repo can't auto-merge, or PR is mergeable now — direct merge.
  if (item.autoMergeAllowed === false || item.mergeStateStatus === "CLEAN") {
    return { kind: "merge", prompt: "Merge this PR?" };
  }

  // PR has open work — arm auto-merge so it lands when checks pass.
  return {
    kind: "arm_auto_merge",
    prompt: "Auto-merge this PR when checks pass?",
  };
}

export function mergeActionLabel(decision: MergeDecision): string {
  switch (decision.kind) {
    case "disable_auto_merge":
      return "Disable auto-merge";
    case "merge":
      return "Merge";
    case "arm_auto_merge":
      return "Auto-merge when ready";
  }
}
