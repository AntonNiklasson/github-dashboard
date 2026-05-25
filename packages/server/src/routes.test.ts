import { beforeEach, describe, expect, it, vi } from "vitest";

const { cacheStore, configStub, fetchersStub, mockOctokit } = vi.hoisted(() => {
  return {
    cacheStore: new Map<string, unknown>(),
    configStub: {
      createConfigFromExample: vi.fn(),
      exampleConfig: "port: 7100\n",
      getConfigStatus: vi.fn(),
      invalidateConfigStatus: vi.fn(),
      openInDefaultApp: vi.fn(),
      readConfig: vi.fn<() => Record<string, unknown> | null>(() => null),
      resolveConfigPath: vi.fn(() => "/test/config.yml"),
    },
    fetchersStub: {
      fetchPrs: vi.fn(),
      fetchReviews: vi.fn(),
      fetchNotifications: vi.fn(),
      latestCheckRunsByName: <T extends { name: string }>(runs: T[]): T[] => {
        const m = new Map<string, T>();
        for (const r of runs) m.set(r.name, r);
        return [...m.values()];
      },
    },
    mockOctokit: {
      users: { getAuthenticated: vi.fn() },
      activity: { markThreadAsDone: vi.fn() },
      pulls: {
        createReview: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
        merge: vi.fn(),
        listFiles: vi.fn(),
        listCommits: vi.fn(),
        listReviewComments: vi.fn(),
      },
      issues: { listComments: vi.fn(), createComment: vi.fn() },
      checks: { listForRef: vi.fn() },
      repos: { getCombinedStatusForRef: vi.fn() },
      actions: {
        listWorkflowRunsForRepo: vi.fn(),
        reRunWorkflow: vi.fn(),
        reRunWorkflowFailedJobs: vi.fn(),
      },
      search: { issuesAndPullRequests: vi.fn() },
      graphql: vi.fn(),
    },
  };
});

vi.mock("./cache.js", () => ({
  getCached: (key: string) => cacheStore.get(key) ?? null,
  setCached: (key: string, data: unknown) => {
    cacheStore.set(key, data);
  },
  patchCache: <T>(key: string, fn: (data: T | null) => T) => {
    cacheStore.set(key, fn((cacheStore.get(key) ?? null) as T | null));
  },
  cachedInstanceIds: () => {
    const ids = new Set<string>();
    for (const key of cacheStore.keys()) {
      const m = key.match(/^([^:]+):(prs|reviews|notifications)$/);
      if (m) ids.add(m[1]);
    }
    return Array.from(ids);
  },
}));

vi.mock("./config.js", () => configStub);
vi.mock("./fetchers.js", () => fetchersStub);

vi.mock("./github-client.js", () => ({
  getClient: async () => mockOctokit,
  getInstance: async (id: string) => ({
    id,
    label: id,
    baseUrl: "https://api.github.com",
    token: "t",
    username: "alice",
  }),
  clearClients: () => {},
}));

// Import after mocks are registered
const { api } = await import("./routes.js");
const { waitForPendingResyncs } = await import("./sync.js");

function call(
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
) {
  return api.request(path, {
    method: init?.method,
    headers: { "content-type": "application/json", ...init?.headers },
    body: init?.body == null ? undefined : JSON.stringify(init.body),
  });
}

beforeEach(async () => {
  await waitForPendingResyncs();
  cacheStore.clear();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /config", () => {
  it("returns the resolved status alongside path + example, stripping tokens", async () => {
    configStub.getConfigStatus.mockResolvedValue({
      kind: "ready",
      instances: [
        {
          id: "github",
          label: "gh",
          baseUrl: "https://api.github.com",
          token: "SECRET",
          username: "alice",
        },
      ],
    });
    const res = await call("/config");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      path: "/test/config.yml",
      example: "port: 7100\n",
      theme: "system",
      status: {
        kind: "ready",
        instances: [{ id: "github", label: "gh", username: "alice" }],
      },
    });
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  it("surfaces the user's theme preference from the config file", async () => {
    configStub.readConfig.mockReturnValue({ theme: "dark" });
    configStub.getConfigStatus.mockResolvedValue({
      kind: "ready",
      instances: [],
    });
    const res = await call("/config");
    const body = await res.json();
    expect(body.theme).toBe("dark");
  });

  it("surfaces a list of errors when the config isn't ready", async () => {
    configStub.getConfigStatus.mockResolvedValue({
      kind: "error",
      errors: [
        {
          kind: "auth",
          instance: "github",
          message: "Token rejected (401 Unauthorized)",
        },
        {
          kind: "auth",
          instance: "ghe",
          message: "Token rejected (401 Unauthorized)",
        },
      ],
    });
    const res = await call("/config");
    const body = await res.json();
    expect(body.status.kind).toBe("error");
    expect(body.status.errors).toHaveLength(2);
    expect(body.status.errors[0]).toMatchObject({
      kind: "auth",
      instance: "github",
    });
    expect(body.status.errors[1]).toMatchObject({
      kind: "auth",
      instance: "ghe",
    });
  });
});

describe("POST /config/create", () => {
  it("writes the example file, invalidates the status cache, and opens it", async () => {
    configStub.createConfigFromExample.mockReturnValue({
      created: true,
      path: "/test/config.yml",
    });
    const res = await call("/config/create", { method: "POST" });
    expect(await res.json()).toEqual({
      created: true,
      path: "/test/config.yml",
    });
    expect(configStub.invalidateConfigStatus).toHaveBeenCalled();
    expect(configStub.openInDefaultApp).toHaveBeenCalledWith(
      "/test/config.yml",
    );
  });

  it("does nothing when the file already exists", async () => {
    configStub.createConfigFromExample.mockReturnValue({
      created: false,
      path: "/test/config.yml",
    });
    const res = await call("/config/create", { method: "POST" });
    expect(await res.json()).toEqual({
      created: false,
      path: "/test/config.yml",
    });
    expect(configStub.invalidateConfigStatus).not.toHaveBeenCalled();
    expect(configStub.openInDefaultApp).not.toHaveBeenCalled();
  });
});

describe("POST /config/reload", () => {
  it("invalidates cached status, clears data caches when ready, and returns the new status", async () => {
    configStub.getConfigStatus.mockResolvedValue({
      kind: "ready",
      instances: [
        {
          id: "github",
          label: "gh",
          baseUrl: "https://api.github.com",
          token: "SECRET",
          username: "alice",
        },
      ],
    });
    cacheStore.set("github:prs", [{ id: 1 }]);
    cacheStore.set("github:reviews", [{ id: 2 }]);
    cacheStore.set("github:notifications", [{ id: 3 }]);
    const res = await call("/config/reload", { method: "POST" });
    expect(res.status).toBe(200);
    expect(configStub.invalidateConfigStatus).toHaveBeenCalled();
    expect(cacheStore.get("github:prs")).toBeNull();
    expect(cacheStore.get("github:reviews")).toBeNull();
    expect(cacheStore.get("github:notifications")).toBeNull();
    const body = await res.json();
    expect(body.status).toEqual({
      kind: "ready",
      instances: [{ id: "github", label: "gh", username: "alice" }],
    });
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  it("clears caches for instances no longer in the new payload", async () => {
    configStub.getConfigStatus.mockResolvedValue({
      kind: "ready",
      instances: [
        {
          id: "github",
          label: "gh",
          baseUrl: "https://api.github.com",
          token: "T",
          username: "alice",
        },
      ],
    });
    cacheStore.set("ghe:prs", [{ id: 9 }]);
    cacheStore.set("ghe:reviews", [{ id: 10 }]);
    cacheStore.set("ghe:notifications", [{ id: 11 }]);
    await call("/config/reload", { method: "POST" });
    expect(cacheStore.get("ghe:prs")).toBeNull();
    expect(cacheStore.get("ghe:reviews")).toBeNull();
    expect(cacheStore.get("ghe:notifications")).toBeNull();
  });

  it("leaves caches alone when reloading into an error state", async () => {
    configStub.getConfigStatus.mockResolvedValue({
      kind: "error",
      errors: [{ kind: "missing_tokens" }],
    });
    cacheStore.set("github:prs", [{ id: 1 }]);
    const res = await call("/config/reload", { method: "POST" });
    expect(res.status).toBe(200);
    expect(cacheStore.get("github:prs")).toEqual([{ id: 1 }]);
    const body = await res.json();
    expect(body.status.errors[0].kind).toBe("missing_tokens");
  });
});

describe("caching behavior on GET /:instanceId/prs", () => {
  it("returns cached data without calling the fetcher", async () => {
    cacheStore.set("github:prs", [{ cached: true }]);
    const res = await call("/github/prs");
    const body = await res.json();
    expect(body).toEqual([{ cached: true }]);
    expect(fetchersStub.fetchPrs).not.toHaveBeenCalled();
  });

  it("calls fetcher and caches the result when cache is empty", async () => {
    fetchersStub.fetchPrs.mockResolvedValue([{ fresh: true }]);
    const res = await call("/github/prs");
    const body = await res.json();
    expect(body).toEqual([{ fresh: true }]);
    expect(fetchersStub.fetchPrs).toHaveBeenCalledWith("github");
    expect(cacheStore.get("github:prs")).toEqual([{ fresh: true }]);
  });

  it("?fresh=1 bypasses cache even when populated", async () => {
    cacheStore.set("github:prs", [{ stale: true }]);
    fetchersStub.fetchPrs.mockResolvedValue([{ fresh: true }]);
    const res = await call("/github/prs?fresh=1");
    const body = await res.json();
    expect(body).toEqual([{ fresh: true }]);
    expect(fetchersStub.fetchPrs).toHaveBeenCalledOnce();
  });
});

describe("DELETE /:instanceId/notifications/:threadId", () => {
  it("calls markThreadAsDone, optimistically updates cache, and resyncs", async () => {
    cacheStore.set("github:notifications", [{ id: "42" }, { id: "99" }]);
    fetchersStub.fetchNotifications.mockResolvedValue([{ id: "99" }]);
    mockOctokit.activity.markThreadAsDone.mockResolvedValue({});
    const res = await call("/github/notifications/42", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(mockOctokit.activity.markThreadAsDone).toHaveBeenCalledWith({
      thread_id: 42,
    });
    await waitForPendingResyncs();
    expect(fetchersStub.fetchNotifications).toHaveBeenCalledWith("github");
    expect(cacheStore.get("github:notifications")).toEqual([{ id: "99" }]);
  });
});

describe("POST /:instanceId/prs/:owner/:repo/:prNumber/approve", () => {
  it("creates an APPROVE review and resyncs prs + reviews", async () => {
    cacheStore.set("github:prs", [{ id: 1 }]);
    cacheStore.set("github:reviews", [{ id: 2 }]);
    fetchersStub.fetchPrs.mockResolvedValue([{ id: 1, approved: true }]);
    fetchersStub.fetchReviews.mockResolvedValue([]);
    mockOctokit.pulls.createReview.mockResolvedValue({});
    const res = await call("/github/prs/o/r/5/approve", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockOctokit.pulls.createReview).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      pull_number: 5,
      event: "APPROVE",
    });
    await waitForPendingResyncs();
    expect(fetchersStub.fetchPrs).toHaveBeenCalledWith("github");
    expect(fetchersStub.fetchReviews).toHaveBeenCalledWith("github");
    expect(cacheStore.get("github:prs")).toEqual([{ id: 1, approved: true }]);
    expect(cacheStore.get("github:reviews")).toEqual([]);
  });
});

describe("POST /:instanceId/prs/:owner/:repo/:prNumber/auto-merge", () => {
  it("enables auto-merge when currently off and returns new state", async () => {
    mockOctokit.pulls.get.mockResolvedValue({
      data: { auto_merge: null, node_id: "PR_123" },
    });
    mockOctokit.graphql.mockResolvedValue({});
    const res = await call("/github/prs/o/r/5/auto-merge", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, autoMerge: true });
    expect(mockOctokit.graphql).toHaveBeenCalledWith(
      expect.stringContaining("enablePullRequestAutoMerge"),
      { id: "PR_123" },
    );
  });

  it("disables auto-merge when currently on", async () => {
    mockOctokit.pulls.get.mockResolvedValue({
      data: { auto_merge: { enabled_at: "x" }, node_id: "PR_123" },
    });
    mockOctokit.graphql.mockResolvedValue({});
    const res = await call("/github/prs/o/r/5/auto-merge", { method: "POST" });
    expect(await res.json()).toEqual({ ok: true, autoMerge: false });
    expect(mockOctokit.graphql).toHaveBeenCalledWith(
      expect.stringContaining("disablePullRequestAutoMerge"),
      { id: "PR_123" },
    );
  });

  it("returns 422 with auto_merge_not_allowed when repo disallows it", async () => {
    mockOctokit.pulls.get.mockResolvedValue({
      data: { auto_merge: null, node_id: "PR_123" },
    });
    mockOctokit.graphql.mockRejectedValue(
      new Error("Auto merge is not allowed for this repository"),
    );
    const res = await call("/github/prs/o/r/5/auto-merge", { method: "POST" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "auto_merge_not_allowed" });
  });
});

describe("POST /:instanceId/prs/:owner/:repo/:prNumber/merge", () => {
  it("merges with squash and resyncs prs, reviews", async () => {
    mockOctokit.pulls.merge.mockResolvedValue({});
    fetchersStub.fetchPrs.mockResolvedValue([]);
    fetchersStub.fetchReviews.mockResolvedValue([]);
    const res = await call("/github/prs/o/r/5/merge", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockOctokit.pulls.merge).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      pull_number: 5,
      merge_method: "squash",
    });
    await waitForPendingResyncs();
    expect(fetchersStub.fetchPrs).toHaveBeenCalledWith("github");
    expect(fetchersStub.fetchReviews).toHaveBeenCalledWith("github");
  });

  it("forwards GitHub's full error message (joining non-empty lines) when merge is rejected", async () => {
    const ghErr = Object.assign(new Error("405"), {
      status: 405,
      response: {
        data: {
          message:
            "Repository rule violations found\n\nA conversation must be resolved before this pull request can be merged.\n",
        },
      },
    });
    mockOctokit.pulls.merge.mockRejectedValue(ghErr);
    const res = await call("/github/prs/o/r/5/merge", { method: "POST" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "merge_rejected",
      message:
        "Repository rule violations found — A conversation must be resolved before this pull request can be merged.",
    });
  });

  it("removes the merged PR from cached prs/reviews even when GitHub still reports it as open", async () => {
    cacheStore.set("github:prs", [
      { id: 1, repo: "o/r", number: 5, title: "x" },
      { id: 2, repo: "o/r", number: 9, title: "other" },
    ]);
    cacheStore.set("github:reviews", [
      { id: 11, repo: "o/r", number: 5, title: "x" },
      { id: 12, repo: "o/r", number: 7, title: "other" },
    ]);
    mockOctokit.pulls.merge.mockResolvedValue({});

    // Simulate GitHub eventual consistency: search index still returns the PR.
    fetchersStub.fetchPrs.mockResolvedValue([
      { id: 1, repo: "o/r", number: 5, title: "x" },
      { id: 2, repo: "o/r", number: 9, title: "other" },
    ]);
    fetchersStub.fetchReviews.mockResolvedValue([
      { id: 11, repo: "o/r", number: 5, title: "x" },
      { id: 12, repo: "o/r", number: 7, title: "other" },
    ]);

    const res = await call("/github/prs/o/r/5/merge", { method: "POST" });
    expect(res.status).toBe(200);
    await waitForPendingResyncs();

    const prs = cacheStore.get("github:prs") as Array<{ number: number }>;
    const reviews = cacheStore.get("github:reviews") as Array<{
      number: number;
    }>;
    expect(prs.map((p) => p.number)).toEqual([9]);
    expect(reviews.map((r) => r.number)).toEqual([7]);
  });
});

describe("POST /:instanceId/prs/:owner/:repo/:prNumber/close", () => {
  it("sets state=closed and resyncs prs, reviews", async () => {
    cacheStore.set("github:prs", [{ id: 1 }]);
    cacheStore.set("github:reviews", [{ id: 2 }]);
    fetchersStub.fetchPrs.mockResolvedValue([]);
    fetchersStub.fetchReviews.mockResolvedValue([]);
    mockOctokit.pulls.update.mockResolvedValue({});
    const res = await call("/github/prs/o/r/5/close", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockOctokit.pulls.update).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      pull_number: 5,
      state: "closed",
    });
    await waitForPendingResyncs();
    expect(fetchersStub.fetchPrs).toHaveBeenCalledWith("github");
    expect(fetchersStub.fetchReviews).toHaveBeenCalledWith("github");
  });

  it("removes the closed PR from cached prs/reviews even when GitHub still reports it as open", async () => {
    cacheStore.set("github:prs", [
      { id: 1, repo: "o/r", number: 5, title: "x" },
      { id: 2, repo: "o/r", number: 9, title: "other" },
    ]);
    cacheStore.set("github:reviews", [
      { id: 11, repo: "o/r", number: 5, title: "x" },
    ]);
    mockOctokit.pulls.update.mockResolvedValue({});

    fetchersStub.fetchPrs.mockResolvedValue([
      { id: 1, repo: "o/r", number: 5, title: "x" },
      { id: 2, repo: "o/r", number: 9, title: "other" },
    ]);
    fetchersStub.fetchReviews.mockResolvedValue([
      { id: 11, repo: "o/r", number: 5, title: "x" },
    ]);

    const res = await call("/github/prs/o/r/5/close", { method: "POST" });
    expect(res.status).toBe(200);
    await waitForPendingResyncs();

    const prs = cacheStore.get("github:prs") as Array<{ number: number }>;
    const reviews = cacheStore.get("github:reviews") as Array<{
      number: number;
    }>;
    expect(prs.map((p) => p.number)).toEqual([9]);
    expect(reviews.map((r) => r.number)).toEqual([]);
  });
});

describe("PATCH /:instanceId/prs/:owner/:repo/:prNumber", () => {
  it("400s when title is missing", async () => {
    const res = await call("/github/prs/o/r/5", { method: "PATCH", body: {} });
    expect(res.status).toBe(400);
    expect(mockOctokit.pulls.update).not.toHaveBeenCalled();
  });

  it("400s on invalid JSON body", async () => {
    const res = await api.request("/github/prs/o/r/5", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(res.status).toBe(400);
  });

  it("updates title and resyncs prs", async () => {
    cacheStore.set("github:prs", [{ id: 1 }]);
    fetchersStub.fetchPrs.mockResolvedValue([{ id: 1, title: "new title" }]);
    mockOctokit.pulls.update.mockResolvedValue({});
    const res = await call("/github/prs/o/r/5", {
      method: "PATCH",
      body: { title: "new title" },
    });
    expect(res.status).toBe(200);
    expect(mockOctokit.pulls.update).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      pull_number: 5,
      title: "new title",
    });
    await waitForPendingResyncs();
    expect(fetchersStub.fetchPrs).toHaveBeenCalledWith("github");
    expect(cacheStore.get("github:prs")).toEqual([
      { id: 1, title: "new title" },
    ]);
  });
});

describe("POST /:instanceId/prs/:owner/:repo/:prNumber/toggle-draft", () => {
  it("marks a draft PR as ready for review", async () => {
    mockOctokit.pulls.get.mockResolvedValue({
      data: { draft: true, node_id: "PR_1" },
    });
    mockOctokit.graphql.mockResolvedValue({});
    const res = await call("/github/prs/o/r/5/toggle-draft", {
      method: "POST",
    });
    expect(await res.json()).toEqual({ ok: true, draft: false });
    expect(mockOctokit.graphql).toHaveBeenCalledWith(
      expect.stringContaining("markPullRequestReadyForReview"),
      { id: "PR_1" },
    );
  });

  it("converts a ready PR to draft", async () => {
    mockOctokit.pulls.get.mockResolvedValue({
      data: { draft: false, node_id: "PR_1" },
    });
    mockOctokit.graphql.mockResolvedValue({});
    const res = await call("/github/prs/o/r/5/toggle-draft", {
      method: "POST",
    });
    expect(await res.json()).toEqual({ ok: true, draft: true });
    expect(mockOctokit.graphql).toHaveBeenCalledWith(
      expect.stringContaining("convertPullRequestToDraft"),
      { id: "PR_1" },
    );
  });

  it("flips draft on the cached PR even when GitHub still reports the old draft state", async () => {
    cacheStore.set("github:prs", [
      { id: 1, repo: "o/r", number: 5, title: "x", draft: true },
      { id: 2, repo: "o/r", number: 9, title: "other", draft: false },
    ]);
    mockOctokit.pulls.get.mockResolvedValue({
      data: { draft: true, node_id: "PR_1" },
    });
    mockOctokit.graphql.mockResolvedValue({});

    // GitHub eventual consistency: still says draft=true.
    fetchersStub.fetchPrs.mockResolvedValue([
      { id: 1, repo: "o/r", number: 5, title: "x", draft: true },
      { id: 2, repo: "o/r", number: 9, title: "other", draft: false },
    ]);

    const res = await call("/github/prs/o/r/5/toggle-draft", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    await waitForPendingResyncs();

    const prs = cacheStore.get("github:prs") as Array<{
      number: number;
      draft: boolean;
    }>;
    expect(prs.find((p) => p.number === 5)?.draft).toBe(false);
    expect(prs.find((p) => p.number === 9)?.draft).toBe(false);
  });
});

describe("POST /:instanceId/prs/:owner/:repo/:prNumber/rerun-ci", () => {
  it("404s when no workflow runs are found", async () => {
    mockOctokit.pulls.get.mockResolvedValue({
      data: { head: { sha: "abc" }, node_id: "PR_1" },
    });
    mockOctokit.actions.listWorkflowRunsForRepo.mockResolvedValue({
      data: { workflow_runs: [] },
    });
    const res = await call("/github/prs/o/r/5/rerun-ci", { method: "POST" });
    expect(res.status).toBe(404);
    expect(mockOctokit.actions.reRunWorkflow).not.toHaveBeenCalled();
    expect(mockOctokit.actions.reRunWorkflowFailedJobs).not.toHaveBeenCalled();
  });

  it("404s when no completed PR-triggered runs are found", async () => {
    mockOctokit.pulls.get.mockResolvedValue({
      data: { head: { sha: "abc" }, node_id: "PR_1" },
    });
    mockOctokit.actions.listWorkflowRunsForRepo.mockResolvedValue({
      data: {
        workflow_runs: [
          // Wrong event
          {
            id: 1,
            workflow_id: 10,
            event: "push",
            status: "completed",
            conclusion: "success",
          },
          // Still running
          {
            id: 2,
            workflow_id: 11,
            event: "pull_request",
            status: "in_progress",
            conclusion: null,
          },
        ],
      },
    });
    const res = await call("/github/prs/o/r/5/rerun-ci", { method: "POST" });
    expect(res.status).toBe(404);
    expect(mockOctokit.actions.reRunWorkflow).not.toHaveBeenCalled();
  });

  it("reruns failed jobs for failed runs and full workflow for passing runs", async () => {
    mockOctokit.pulls.get.mockResolvedValue({
      data: { head: { sha: "abc" }, node_id: "PR_1" },
    });
    mockOctokit.actions.listWorkflowRunsForRepo.mockResolvedValue({
      data: {
        workflow_runs: [
          // Newer attempt of workflow 20 — should win
          {
            id: 200,
            workflow_id: 20,
            event: "pull_request",
            status: "completed",
            conclusion: "failure",
          },
          // Older attempt of workflow 20 — should be ignored
          {
            id: 199,
            workflow_id: 20,
            event: "pull_request",
            status: "completed",
            conclusion: "success",
          },
          // Different workflow, success
          {
            id: 300,
            workflow_id: 30,
            event: "pull_request",
            status: "completed",
            conclusion: "success",
          },
          // Wrong event
          {
            id: 400,
            workflow_id: 40,
            event: "push",
            status: "completed",
            conclusion: "failure",
          },
        ],
      },
    });
    mockOctokit.actions.reRunWorkflow.mockResolvedValue({});
    mockOctokit.actions.reRunWorkflowFailedJobs.mockResolvedValue({});
    const res = await call("/github/prs/o/r/5/rerun-ci", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, triggered: 2 });
    expect(mockOctokit.actions.reRunWorkflowFailedJobs).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      run_id: 200,
    });
    expect(mockOctokit.actions.reRunWorkflow).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      run_id: 300,
    });
    expect(mockOctokit.actions.reRunWorkflow).not.toHaveBeenCalledWith(
      expect.objectContaining({ run_id: 400 }),
    );
  });

  it("502s when every rerun call fails", async () => {
    mockOctokit.pulls.get.mockResolvedValue({
      data: { head: { sha: "abc" }, node_id: "PR_1" },
    });
    mockOctokit.actions.listWorkflowRunsForRepo.mockResolvedValue({
      data: {
        workflow_runs: [
          {
            id: 500,
            workflow_id: 50,
            event: "pull_request",
            status: "completed",
            conclusion: "failure",
          },
        ],
      },
    });
    mockOctokit.actions.reRunWorkflowFailedJobs.mockRejectedValue(
      new Error("boom"),
    );
    const res = await call("/github/prs/o/r/5/rerun-ci", { method: "POST" });
    expect(res.status).toBe(502);
  });
});

describe("GET /:instanceId/prs/:owner/:repo/:prNumber/meta", () => {
  it("merges legacy statuses + checks into a unified list", async () => {
    mockOctokit.pulls.listFiles.mockResolvedValue({
      data: [
        {
          filename: "a.ts",
          additions: 1,
          deletions: 2,
          status: "modified",
          patch: "+x",
        },
      ],
    });
    mockOctokit.pulls.listCommits.mockResolvedValue({
      data: [{ sha: "abcdef1234", commit: { message: "feat: x\n\nbody" } }],
    });
    mockOctokit.checks.listForRef.mockResolvedValue({
      data: {
        check_runs: [
          { name: "build", status: "completed", conclusion: "success" },
        ],
      },
    });
    mockOctokit.repos.getCombinedStatusForRef.mockResolvedValue({
      data: {
        statuses: [
          { context: "ci/old", state: "failure" },
          { context: "build", state: "success" },
        ],
      },
    });
    const res = await call("/github/prs/o/r/5/meta");
    const body = await res.json();
    expect(body.files).toEqual([
      {
        filename: "a.ts",
        additions: 1,
        deletions: 2,
        status: "modified",
        patch: "+x",
      },
    ]);
    expect(body.commits).toEqual([{ sha: "abcdef1", message: "feat: x" }]);
    // check-run takes precedence over same-named status (Map overwrite order)
    const buildCheck = body.checks.find(
      (c: { name: string }) => c.name === "build",
    );
    expect(buildCheck.conclusion).toBe("success");
    const oldCheck = body.checks.find(
      (c: { name: string }) => c.name === "ci/old",
    );
    expect(oldCheck.conclusion).toBe("failure");
  });
});

describe("GET /:instanceId/prs/:owner/:repo/:prNumber/comments", () => {
  it("merges issue + review comments sorted by createdAt", async () => {
    mockOctokit.issues.listComments.mockResolvedValue({
      data: [
        {
          id: 1,
          user: { login: "alice" },
          body: "first",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });
    mockOctokit.pulls.listReviewComments.mockResolvedValue({
      data: [
        {
          id: 2,
          user: { login: "bob" },
          body: "on file",
          created_at: "2026-01-02T00:00:00Z",
          path: "a.ts",
        },
      ],
    });
    const res = await call("/github/prs/o/r/5/comments");
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe(1);
    expect(body[0].path).toBeNull();
    expect(body[1].path).toBe("a.ts");
  });
});

describe("GET /:instanceId/search/prs", () => {
  it("scopes the search query to the authenticated user's closed PRs", async () => {
    mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
      data: { items: [] },
    });
    await call("/github/search/prs?q=feature");
    const call0 = mockOctokit.search.issuesAndPullRequests.mock.calls[0][0];
    expect(call0.q).toContain("author:alice");
    expect(call0.q).toContain("type:pr");
    expect(call0.q).toContain("state:closed");
    expect(call0.q).toContain("feature");
  });
});
