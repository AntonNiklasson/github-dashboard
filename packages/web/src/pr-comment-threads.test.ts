import { describe, expect, it } from "vitest";
import { type Comment, buildThreads } from "./pr-comment-threads";

// Helper so the tests focus on id/inReplyToId — everything else is filler.
function c(id: number, inReplyToId: number | null = null): Comment {
  return {
    id,
    author: "u",
    body: "",
    createdAt: new Date(2026, 0, 1, 0, 0, id).toISOString(),
    path: null,
    inReplyToId,
  };
}

describe("buildThreads", () => {
  it("returns [] for an empty list", () => {
    expect(buildThreads([])).toEqual([]);
  });

  it("treats every comment as a root when there are no replies", () => {
    const out = buildThreads([c(1), c(2), c(3)]);
    expect(out.map((t) => t.root.id)).toEqual([1, 2, 3]);
    expect(out.every((t) => t.replies.length === 0)).toBe(true);
  });

  it("groups replies under their root and preserves chronological order", () => {
    // Server sorts asc by createdAt — replicate that order here.
    const out = buildThreads([c(1), c(2, 1), c(3, 1)]);
    expect(out).toHaveLength(1);
    expect(out[0].root.id).toBe(1);
    expect(out[0].replies.map((r) => r.id)).toEqual([2, 3]);
  });

  it("handles multiple independent threads", () => {
    const out = buildThreads([c(1), c(2), c(3, 1), c(4, 2), c(5, 1)]);
    expect(out.map((t) => t.root.id)).toEqual([1, 2]);
    expect(out[0].replies.map((r) => r.id)).toEqual([3, 5]);
    expect(out[1].replies.map((r) => r.id)).toEqual([4]);
  });

  it("promotes an orphan reply (parent not in dataset) to a root", () => {
    // Reply points at id 99, which isn't in the input — fall through to root.
    const out = buildThreads([c(1, 99), c(2, 1)]);
    expect(out.map((t) => t.root.id)).toEqual([1]);
    expect(out[0].replies.map((r) => r.id)).toEqual([2]);
  });

  it("walks nested chains up to the ultimate root", () => {
    // C → B → A. GitHub's API normally flattens this, but the algorithm
    // claims to handle deeper chains — verify it actually does.
    const out = buildThreads([c(1), c(2, 1), c(3, 2)]);
    expect(out).toHaveLength(1);
    expect(out[0].root.id).toBe(1);
    expect(out[0].replies.map((r) => r.id)).toEqual([2, 3]);
  });

  it("keeps issue-style comments (inReplyToId always null) as separate roots", () => {
    const out = buildThreads([c(1), c(2), c(3)]);
    expect(out).toHaveLength(3);
  });

  it("mixes issue comments and a review thread", () => {
    const out = buildThreads([c(1), c(2), c(3, 2), c(4)]);
    expect(out.map((t) => t.root.id)).toEqual([1, 2, 4]);
    expect(out.find((t) => t.root.id === 2)?.replies.map((r) => r.id)).toEqual([
      3,
    ]);
  });

  it("breaks self-referential links instead of looping forever", () => {
    // Pathological input: a comment that claims to reply to itself.
    const out = buildThreads([c(1, 1)]);
    expect(out.map((t) => t.root.id)).toEqual([1]);
    expect(out[0].replies).toEqual([]);
  });
});
