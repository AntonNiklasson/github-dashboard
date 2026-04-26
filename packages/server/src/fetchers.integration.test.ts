import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockOctokit } = vi.hoisted(() => ({
  mockOctokit: {
    search: { issuesAndPullRequests: vi.fn() },
    pulls: { get: vi.fn(), listReviews: vi.fn() },
    checks: { listForRef: vi.fn() },
    repos: { getCombinedStatusForRef: vi.fn() },
    activity: { listNotificationsForAuthenticatedUser: vi.fn() },
    graphql: vi.fn(),
  },
}));

vi.mock("./github-client.js", () => ({
  getClient: async () => mockOctokit,
  getInstance: async (id: string) => ({
    id,
    label: id,
    baseUrl: "",
    token: "t",
    username: "alice",
  }),
}));

const { fetchPrs, fetchNotifications, fetchRecentPrs } = await import(
  "./fetchers.js"
);

beforeEach(() => {
  vi.clearAllMocks();
  // Safe defaults
  mockOctokit.pulls.listReviews.mockResolvedValue({ data: [] });
  mockOctokit.pulls.get.mockResolvedValue({
    data: {
      body: "",
      head: { ref: "feat" },
      base: { ref: "main" },
      additions: 0,
      deletions: 0,
      commits: 0,
      comments: 0,
      review_comments: 0,
      mergeable: true,
    },
  });
  mockOctokit.checks.listForRef.mockResolvedValue({
    data: { check_runs: [{ status: "completed", conclusion: "success" }] },
  });
  mockOctokit.repos.getCombinedStatusForRef.mockResolvedValue({
    data: { statuses: [] },
  });
  mockOctokit.graphql.mockResolvedValue({});
});

function prSearchItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    node_id: "PR_1",
    number: 5,
    title: "t",
    html_url: "http://x",
    repository_url: "https://api.github.com/repos/o/r",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    user: { login: "alice", avatar_url: "" },
    draft: false,
    labels: [{ name: "bug" }],
    ...over,
  };
}

describe("fetchPrs", () => {
  it("queries authored open PRs and returns shaped results", async () => {
    mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
      data: { items: [prSearchItem()] },
    });
    const prs = await fetchPrs("github");
    expect(mockOctokit.search.issuesAndPullRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "author:alice type:pr state:open",
        sort: "updated",
        order: "desc",
      }),
    );
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      number: 5,
      repo: "o/r",
      author: "alice",
      ciStatus: "success",
      labels: ["bug"],
    });
  });

  it("filters out PRs whose author doesn't match (defensive)", async () => {
    mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
      data: {
        items: [
          prSearchItem({ user: { login: "alice", avatar_url: "" } }),
          prSearchItem({
            id: 2,
            node_id: "PR_2",
            user: { login: "bot", avatar_url: "" },
          }),
        ],
      },
    });
    const prs = await fetchPrs("github");
    expect(prs.map((p) => p.author)).toEqual(["alice"]);
  });

  it("populates mergeQueue + autoMerge + reviewDecision from GraphQL", async () => {
    mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
      data: { items: [prSearchItem()] },
    });
    mockOctokit.graphql.mockResolvedValue({
      pr0: {
        id: "PR_1",
        mergeQueueEntry: { id: "MQ_1" },
        autoMergeRequest: { enabledAt: "x" },
        reviewDecision: "APPROVED",
      },
    });
    const prs = await fetchPrs("github");
    expect(prs[0]).toMatchObject({
      inMergeQueue: true,
      autoMerge: true,
      reviewDecision: "APPROVED",
    });
  });

  it("swallows GraphQL errors and leaves merge-queue fields as defaults", async () => {
    mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
      data: { items: [prSearchItem()] },
    });
    mockOctokit.graphql.mockRejectedValue(new Error("graphql down"));
    const prs = await fetchPrs("github");
    expect(prs[0]).toMatchObject({
      inMergeQueue: false,
      autoMerge: false,
      reviewDecision: null,
    });
  });

  it("handles empty search results", async () => {
    mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
      data: { items: [] },
    });
    const prs = await fetchPrs("github");
    expect(prs).toEqual([]);
    expect(mockOctokit.graphql).not.toHaveBeenCalled();
  });
});

describe("fetchRecentPrs", () => {
  it("queries closed PRs from the last week", async () => {
    mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
      data: { items: [] },
    });
    await fetchRecentPrs("github");
    const q = mockOctokit.search.issuesAndPullRequests.mock.calls[0][0].q;
    expect(q).toContain("author:alice");
    expect(q).toContain("state:closed");
    expect(q).toMatch(/closed:>=\d{4}-\d{2}-\d{2}/);
  });
});

describe("fetchNotifications", () => {
  it("omits review_requested notifications", async () => {
    mockOctokit.activity.listNotificationsForAuthenticatedUser.mockResolvedValue(
      {
        data: [
          {
            id: "1",
            subject: { title: "x", type: "PullRequest", url: "http://x" },
            reason: "mention",
            repository: { full_name: "o/r" },
            updated_at: "2026-01-01T00:00:00Z",
            unread: true,
          },
          {
            id: "2",
            subject: { title: "y", type: "PullRequest", url: "http://y" },
            reason: "review_requested",
            repository: { full_name: "o/r" },
            updated_at: "2026-01-02T00:00:00Z",
            unread: true,
          },
        ],
      },
    );
    const notifs = await fetchNotifications("github");
    expect(notifs.map((n) => n.id)).toEqual(["1"]);
  });

  it("shapes the payload for the UI", async () => {
    mockOctokit.activity.listNotificationsForAuthenticatedUser.mockResolvedValue(
      {
        data: [
          {
            id: "1",
            subject: { title: "hello", type: "Issue", url: "http://x" },
            reason: "mention",
            repository: { full_name: "o/r" },
            updated_at: "2026-01-01T00:00:00Z",
            unread: false,
          },
        ],
      },
    );
    const [n] = await fetchNotifications("github");
    expect(n).toEqual({
      id: "1",
      title: "hello",
      type: "Issue",
      reason: "mention",
      repo: "o/r",
      updatedAt: "2026-01-01T00:00:00Z",
      unread: false,
      url: "http://x",
    });
  });
});
