import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoMergeNotAllowedError } from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    api: {
      toggleAutoMerge: vi.fn(),
    },
  };
});

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

import { api } from "./api";
import { toggleAutoMerge } from "./mutations";
import type { PR } from "./types";

const toggleAutoMergeMock = vi.mocked(api.toggleAutoMerge);

const target = {
  instanceId: "github",
  repo: "o/r",
  number: 42,
  title: "Add thing",
  url: "https://github.com/o/r/pull/42",
};

function basePr(overrides: Partial<PR> = {}): PR {
  return {
    id: 1,
    number: 42,
    title: "Add thing",
    body: "",
    url: "https://github.com/o/r/pull/42",
    repo: "o/r",
    updatedAt: "2026-04-30T00:00:00Z",
    author: "anton",
    authorAvatar: "",
    draft: false,
    ciStatus: "success",
    inMergeQueue: false,
    autoMerge: false,
    headBranch: "feat",
    baseBranch: "main",
    reviews: { approved: [], changesRequested: [] },
    additions: 1,
    deletions: 0,
    commits: 1,
    commentCount: 0,
    labels: [],
    ...overrides,
  };
}

describe("toggleAutoMerge", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(["prs", "github"], [basePr()]);
  });
  afterEach(() => vi.clearAllMocks());
  it("keeps the PR visible when enabling auto-merge", async () => {
    toggleAutoMergeMock.mockResolvedValue({ ok: true, autoMerge: true });
    await toggleAutoMerge(qc, target, false);
    expect(toggleAutoMergeMock).toHaveBeenCalledWith("github", "o/r", 42);
    expect(qc.getQueryData<PR[]>(["prs", "github"])).toEqual([
      basePr({ autoMerge: true }),
    ]);
  });
  it("restores the snapshot when auto-merge is rejected", async () => {
    toggleAutoMergeMock.mockRejectedValue(new AutoMergeNotAllowedError());
    await expect(toggleAutoMerge(qc, target, false)).rejects.toThrow(
      AutoMergeNotAllowedError,
    );
    expect(qc.getQueryData<PR[]>(["prs", "github"])).toEqual([basePr()]);
  });
});
