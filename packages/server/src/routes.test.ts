import { beforeEach, describe, expect, it, vi } from "vitest";

const { cacheStore, configStub, fetchersStub, mockOctokit, octokitHolder } =
  vi.hoisted(() => {
    return {
      cacheStore: new Map<string, unknown>(),
      configStub: {
        configExists: vi.fn(),
        readConfig: vi.fn(),
        writeConfig: vi.fn(),
        resolveInstances: vi.fn(),
        getInstances: vi.fn(),
      },
      fetchersStub: {
        fetchPrs: vi.fn(),
        fetchRecentPrs: vi.fn(),
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
        },
        search: { issuesAndPullRequests: vi.fn() },
        graphql: vi.fn(),
      },
      octokitHolder: { ctor: null as unknown },
    };
  });

vi.mock("./cache.js", () => ({
  getCached: (key: string) => cacheStore.get(key) ?? null,
  setCached: (key: string, data: unknown) => {
    cacheStore.set(key, data);
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

vi.mock("@octokit/rest", async () => {
  const { octokitStub } = await import("./test-utils/octokit-mock.js");
  octokitHolder.ctor = octokitStub({ login: "alice" });
  return {
    get Octokit() {
      return octokitHolder.ctor;
    },
  };
});

// Import after mocks are registered
const { api, maskToken } = await import("./routes.js");

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

beforeEach(() => {
  cacheStore.clear();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("maskToken", () => {
  it("masks long tokens keeping the last 4 chars", () => {
    expect(maskToken("ghp_abcdefghij")).toBe("****ghij");
  });

  it("fully masks tokens of 4 chars or less", () => {
    expect(maskToken("abcd")).toBe("****");
    expect(maskToken("abc")).toBe("****");
    expect(maskToken("")).toBe("****");
  });
});

describe("GET /config", () => {
  it("returns DEMO shape when DEMO=1", async () => {
    vi.stubEnv("DEMO", "1");
    const res = await call("/config");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(true);
    expect(body.config.github.token).toMatch(/^\*+/);
  });

  it("returns exists:false when config missing", async () => {
    configStub.configExists.mockReturnValue(false);
    const res = await call("/config");
    const body = await res.json();
    expect(body).toEqual({ exists: false });
  });

  it("masks github + enterprise tokens", async () => {
    configStub.configExists.mockReturnValue(true);
    configStub.readConfig.mockReturnValue({
      github: { token: "ghp_secretvalue" },
      enterprise: {
        label: "Work",
        baseUrl: "https://ghe.example.com/api/v3",
        token: "ghe_secretvalue",
      },
      port: 7100,
    });
    const res = await call("/config");
    const body = await res.json();
    expect(body.config.github.token).toBe("****alue");
    expect(body.config.enterprise.token).toBe("****alue");
    expect(body.config.enterprise.baseUrl).toBe(
      "https://ghe.example.com/api/v3",
    );
  });
});

describe("PUT /config", () => {
  it("rejects with 422 when github token is invalid", async () => {
    const { octokitStub } = await import("./test-utils/octokit-mock.js");
    const original = octokitHolder.ctor;
    octokitHolder.ctor = octokitStub({ throws: new Error("401") });
    configStub.readConfig.mockReturnValue(null);
    const res = await call("/config", {
      method: "PUT",
      body: { github: { token: "bad" } },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors).toContain("GitHub.com token is invalid");
    expect(configStub.writeConfig).not.toHaveBeenCalled();
    octokitHolder.ctor = original;
  });

  it("preserves existing token when incoming is empty string", async () => {
    configStub.readConfig.mockReturnValue({ github: { token: "existing" } });
    configStub.resolveInstances.mockResolvedValue([]);
    const res = await call("/config", {
      method: "PUT",
      body: { github: { token: "" } },
    });
    expect(res.status).toBe(200);
    expect(configStub.writeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        github: expect.objectContaining({ token: "existing" }),
      }),
    );
  });

  it("clears cached data after successful save", async () => {
    configStub.readConfig.mockReturnValue(null);
    configStub.resolveInstances.mockResolvedValue([
      {
        id: "github",
        label: "gh",
        baseUrl: "",
        token: "t",
        username: "alice",
      },
    ]);
    cacheStore.set("github:prs", [{ id: 1 }]);
    await call("/config", {
      method: "PUT",
      body: {},
    });
    expect(cacheStore.get("github:prs")).toBeNull();
    expect(cacheStore.get("github:reviews")).toBeNull();
    expect(cacheStore.get("github:notifications")).toBeNull();
  });
});

describe("GET /instances", () => {
  it("returns id/label/username without exposing tokens", async () => {
    configStub.getInstances.mockResolvedValue([
      {
        id: "github",
        label: "gh",
        baseUrl: "",
        token: "SECRET",
        username: "alice",
      },
    ]);
    const res = await call("/instances");
    const body = await res.json();
    expect(body).toEqual([{ id: "github", label: "gh", username: "alice" }]);
    expect(JSON.stringify(body)).not.toContain("SECRET");
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
  it("calls markThreadAsDone and removes the thread from cache", async () => {
    cacheStore.set("github:notifications", [{ id: "42" }, { id: "99" }]);
    mockOctokit.activity.markThreadAsDone.mockResolvedValue({});
    const res = await call("/github/notifications/42", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(mockOctokit.activity.markThreadAsDone).toHaveBeenCalledWith({
      thread_id: 42,
    });
    expect(cacheStore.get("github:notifications")).toEqual([{ id: "99" }]);
  });
});

describe("POST /:instanceId/prs/:owner/:repo/:prNumber/approve", () => {
  it("creates an APPROVE review and invalidates prs + reviews caches", async () => {
    cacheStore.set("github:prs", [{ id: 1 }]);
    cacheStore.set("github:reviews", [{ id: 2 }]);
    mockOctokit.pulls.createReview.mockResolvedValue({});
    const res = await call("/github/prs/o/r/5/approve", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockOctokit.pulls.createReview).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      pull_number: 5,
      event: "APPROVE",
    });
    expect(cacheStore.get("github:prs")).toBeNull();
    expect(cacheStore.get("github:reviews")).toBeNull();
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
      expect.stringContaining("disableAutoMerge"),
      { id: "PR_123" },
    );
  });
});

describe("POST /:instanceId/prs/:owner/:repo/:prNumber/close", () => {
  it("sets state=closed and invalidates prs + reviews caches", async () => {
    cacheStore.set("github:prs", [{ id: 1 }]);
    cacheStore.set("github:reviews", [{ id: 2 }]);
    mockOctokit.pulls.update.mockResolvedValue({});
    const res = await call("/github/prs/o/r/5/close", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockOctokit.pulls.update).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      pull_number: 5,
      state: "closed",
    });
    expect(cacheStore.get("github:prs")).toBeNull();
    expect(cacheStore.get("github:reviews")).toBeNull();
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

  it("updates title and invalidates prs cache", async () => {
    cacheStore.set("github:prs", [{ id: 1 }]);
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
    expect(cacheStore.get("github:prs")).toBeNull();
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
  });

  it("reruns the latest workflow run", async () => {
    mockOctokit.pulls.get.mockResolvedValue({
      data: { head: { sha: "abc" }, node_id: "PR_1" },
    });
    mockOctokit.actions.listWorkflowRunsForRepo.mockResolvedValue({
      data: { workflow_runs: [{ id: 777 }] },
    });
    mockOctokit.actions.reRunWorkflow.mockResolvedValue({});
    const res = await call("/github/prs/o/r/5/rerun-ci", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockOctokit.actions.reRunWorkflow).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      run_id: 777,
    });
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
