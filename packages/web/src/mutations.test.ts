import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoMergeNotAllowedError } from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    api: {
      mergePr: vi.fn(),
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
import { mergePr } from "./mutations";
import { toast } from "sonner";
import type { PR } from "./types";

const mergePrMock = vi.mocked(api.mergePr);
const toggleAutoMergeMock = vi.mocked(api.toggleAutoMerge);
const toastSuccess = vi.mocked(toast.success);
const toastError = vi.mocked(toast.error);

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

describe("mergePr", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(["prs", "github"], [basePr()]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("merges successfully and shows success toast", async () => {
    mergePrMock.mockResolvedValue({ ok: true });
    await mergePr(qc, target);
    expect(mergePrMock).toHaveBeenCalledWith("github", "o/r", 42);
    expect(toggleAutoMergeMock).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("PR merged");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("falls back to arming auto-merge when direct merge fails", async () => {
    mergePrMock.mockRejectedValue(
      new Error(
        "Repository rule violations found — A conversation must be resolved",
      ),
    );
    toggleAutoMergeMock.mockResolvedValue({ ok: true, autoMerge: true });

    await mergePr(qc, target);

    expect(toggleAutoMergeMock).toHaveBeenCalledWith("github", "o/r", 42);
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Auto-merge enabled"),
    );
    expect(toastError).not.toHaveBeenCalled();

    // PR is restored to the cache and now flagged autoMerge=true
    const prs = qc.getQueryData<PR[]>(["prs", "github"]);
    expect(prs).toHaveLength(1);
    expect(prs?.[0]?.autoMerge).toBe(true);
  });

  it("surfaces the original merge error when repo doesn't allow auto-merge", async () => {
    const mergeErr = new Error(
      "Repository rule violations found — required reviews missing",
    );
    mergePrMock.mockRejectedValue(mergeErr);
    toggleAutoMergeMock.mockRejectedValue(new AutoMergeNotAllowedError());

    await expect(mergePr(qc, target)).rejects.toThrow(mergeErr);

    expect(toggleAutoMergeMock).toHaveBeenCalledWith("github", "o/r", 42);
    expect(toastError).toHaveBeenCalledWith(mergeErr.message);
    expect(toastSuccess).not.toHaveBeenCalled();

    // PR is restored to the cache, autoMerge unchanged
    const prs = qc.getQueryData<PR[]>(["prs", "github"]);
    expect(prs).toHaveLength(1);
    expect(prs?.[0]?.autoMerge).toBe(false);
  });
});
