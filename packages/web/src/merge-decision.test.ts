import { describe, expect, it } from "vitest";
import {
  type MergeInput,
  decideMergeAction,
  mergeActionLabel,
} from "./merge-decision";

describe("decideMergeAction", () => {
  it("disables auto-merge when it's currently armed (other fields ignored)", () => {
    const cases: MergeInput[] = [
      { autoMerge: true },
      { autoMerge: true, autoMergeAllowed: false },
      { autoMerge: true, mergeStateStatus: "BLOCKED" },
      { autoMerge: true, autoMergeAllowed: true, mergeStateStatus: "CLEAN" },
    ];
    for (const c of cases) {
      expect(decideMergeAction(c)).toEqual({ kind: "disable_auto_merge" });
    }
  });

  it("merges directly when the repo doesn't allow auto-merge", () => {
    expect(
      decideMergeAction({
        autoMergeAllowed: false,
        mergeStateStatus: "BLOCKED",
      }),
    ).toEqual({ kind: "merge", prompt: "Merge this PR?" });
  });

  it("merges directly when mergeStateStatus is CLEAN", () => {
    expect(
      decideMergeAction({ autoMergeAllowed: true, mergeStateStatus: "CLEAN" }),
    ).toEqual({ kind: "merge", prompt: "Merge this PR?" });
  });

  it("prefers direct merge over arm when both repo disallows auto-merge AND state is CLEAN", () => {
    // Same outcome as either branch alone — but verifies precedence is stable.
    expect(
      decideMergeAction({ autoMergeAllowed: false, mergeStateStatus: "CLEAN" }),
    ).toEqual({ kind: "merge", prompt: "Merge this PR?" });
  });

  it("arms auto-merge when the PR has open work (BLOCKED, BEHIND, UNSTABLE, etc.)", () => {
    for (const status of [
      "BLOCKED",
      "BEHIND",
      "UNSTABLE",
      "DIRTY",
      "UNKNOWN",
    ]) {
      expect(
        decideMergeAction({ autoMergeAllowed: true, mergeStateStatus: status }),
      ).toEqual({
        kind: "arm_auto_merge",
        prompt: "Auto-merge this PR when checks pass?",
      });
    }
  });

  it("arms auto-merge when repo settings are unknown and state isn't CLEAN", () => {
    // autoMergeAllowed undefined (cache miss) + non-CLEAN state — fall through
    // to arming and let the runtime 422 fallback handle stale-cache cases.
    expect(decideMergeAction({ mergeStateStatus: "BLOCKED" })).toEqual({
      kind: "arm_auto_merge",
      prompt: "Auto-merge this PR when checks pass?",
    });
  });

  it("treats undefined autoMerge as off (falsy)", () => {
    expect(
      decideMergeAction({ autoMergeAllowed: true, mergeStateStatus: "CLEAN" }),
    ).toEqual({ kind: "merge", prompt: "Merge this PR?" });
  });
});

describe("mergeActionLabel", () => {
  it("labels each decision kind", () => {
    expect(mergeActionLabel({ kind: "disable_auto_merge" })).toBe(
      "Disable auto-merge",
    );
    expect(mergeActionLabel({ kind: "merge", prompt: "x" })).toBe("Merge");
    expect(mergeActionLabel({ kind: "arm_auto_merge", prompt: "x" })).toBe(
      "Auto-merge when ready",
    );
  });
});
