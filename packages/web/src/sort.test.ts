import { describe, expect, it } from "vitest";
import {
  compareNotifications,
  comparePrs,
  compareReviews,
  type NotificationSortField,
  type PrSortField,
  type ReviewSortField,
  type SortState,
} from "./sort";
import type { Notification, PR, ReviewRequest } from "./types";

function pr(overrides: Partial<PR>): PR {
  return {
    id: 1,
    number: 1,
    title: "t",
    body: "",
    url: "",
    repo: "r",
    updatedAt: "2024-01-01T00:00:00Z",
    author: "a",
    authorAvatar: "",
    draft: false,
    ciStatus: "",
    inMergeQueue: false,
    autoMerge: false,
    headBranch: "",
    baseBranch: "",
    reviews: { approved: [], changesRequested: [] },
    additions: 0,
    deletions: 0,
    commits: 0,
    commentCount: 0,
    labels: [],
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRequest>): ReviewRequest {
  return {
    id: 1,
    number: 1,
    title: "t",
    body: "",
    url: "",
    repo: "r",
    updatedAt: "2024-01-01T00:00:00Z",
    author: "a",
    authorAvatar: "",
    draft: false,
    merged: false,
    ciStatus: "",
    inMergeQueue: false,
    autoMerge: false,
    headBranch: "",
    baseBranch: "",
    reviews: { approved: [], changesRequested: [] },
    additions: 0,
    deletions: 0,
    commits: 0,
    commentCount: 0,
    ...overrides,
  };
}

function notif(overrides: Partial<Notification>): Notification {
  return {
    id: "1",
    title: "t",
    type: "",
    reason: "",
    repo: "r",
    updatedAt: "2024-01-01T00:00:00Z",
    unread: false,
    url: "",
    ...overrides,
  };
}

function sign(n: number) {
  return n === 0 ? 0 : n > 0 ? 1 : -1;
}

describe("comparePrs", () => {
  const older = pr({
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-02-01T00:00:00Z",
    title: "alpha",
    additions: 1,
    deletions: 1,
  });
  const newer = pr({
    createdAt: "2024-03-01T00:00:00Z",
    updatedAt: "2024-04-01T00:00:00Z",
    title: "beta",
    additions: 10,
    deletions: 10,
  });

  it("sorts by created, desc puts newer first", () => {
    expect(
      sign(comparePrs(older, newer, { field: "created", dir: "desc" })),
    ).toBe(1);
    expect(
      sign(comparePrs(older, newer, { field: "created", dir: "asc" })),
    ).toBe(-1);
  });

  it("sorts by updated", () => {
    expect(
      sign(comparePrs(older, newer, { field: "updated", dir: "desc" })),
    ).toBe(1);
  });

  it("sorts by title alphabetically", () => {
    expect(sign(comparePrs(older, newer, { field: "title", dir: "asc" }))).toBe(
      -1,
    );
    expect(
      sign(comparePrs(older, newer, { field: "title", dir: "desc" })),
    ).toBe(1);
  });

  it("sorts by size (additions + deletions)", () => {
    expect(sign(comparePrs(older, newer, { field: "size", dir: "asc" }))).toBe(
      -1,
    );
    expect(sign(comparePrs(older, newer, { field: "size", dir: "desc" }))).toBe(
      1,
    );
  });

  it("treats missing createdAt as epoch", () => {
    const noDate = pr({ createdAt: undefined });
    expect(
      sign(comparePrs(noDate, newer, { field: "created", dir: "asc" })),
    ).toBe(-1);
  });

  it("returns 0 for unknown field (stale persisted state)", () => {
    const stale = {
      field: "bogus",
      dir: "desc",
    } as unknown as SortState<PrSortField>;
    expect(comparePrs(older, newer, stale)).toBe(0);
  });
});

describe("compareReviews", () => {
  const a = review({
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-02-01T00:00:00Z",
    title: "alpha",
    author: "ann",
  });
  const b = review({
    createdAt: "2024-03-01T00:00:00Z",
    updatedAt: "2024-04-01T00:00:00Z",
    title: "beta",
    author: "bob",
  });

  it("sorts by created", () => {
    expect(sign(compareReviews(a, b, { field: "created", dir: "asc" }))).toBe(
      -1,
    );
    expect(sign(compareReviews(a, b, { field: "created", dir: "desc" }))).toBe(
      1,
    );
  });

  it("sorts by updated", () => {
    expect(sign(compareReviews(a, b, { field: "updated", dir: "asc" }))).toBe(
      -1,
    );
  });

  it("sorts by title", () => {
    expect(sign(compareReviews(a, b, { field: "title", dir: "asc" }))).toBe(-1);
  });

  it("sorts by author", () => {
    expect(sign(compareReviews(a, b, { field: "author", dir: "asc" }))).toBe(
      -1,
    );
  });

  it("returns 0 for unknown field", () => {
    const stale = {
      field: "bogus",
      dir: "desc",
    } as unknown as SortState<ReviewSortField>;
    expect(compareReviews(a, b, stale)).toBe(0);
  });
});

describe("compareNotifications", () => {
  const a = notif({
    updatedAt: "2024-01-01T00:00:00Z",
    title: "alpha",
    repo: "anvil",
  });
  const b = notif({
    updatedAt: "2024-02-01T00:00:00Z",
    title: "beta",
    repo: "boulder",
  });

  it("sorts by updated", () => {
    expect(
      sign(compareNotifications(a, b, { field: "updated", dir: "asc" })),
    ).toBe(-1);
    expect(
      sign(compareNotifications(a, b, { field: "updated", dir: "desc" })),
    ).toBe(1);
  });

  it("sorts by title", () => {
    expect(
      sign(compareNotifications(a, b, { field: "title", dir: "asc" })),
    ).toBe(-1);
  });

  it("sorts by repo", () => {
    expect(
      sign(compareNotifications(a, b, { field: "repo", dir: "asc" })),
    ).toBe(-1);
  });

  it("returns 0 for unknown field", () => {
    const stale = {
      field: "bogus",
      dir: "desc",
    } as unknown as SortState<NotificationSortField>;
    expect(compareNotifications(a, b, stale)).toBe(0);
  });
});
