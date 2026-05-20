import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockOctokit, cacheStore } = vi.hoisted(() => ({
  mockOctokit: {
    search: { issuesAndPullRequests: vi.fn() },
    pulls: { get: vi.fn(), listReviews: vi.fn() },
    issues: { listEventsForTimeline: vi.fn() },
    checks: { listForRef: vi.fn() },
    repos: { getCombinedStatusForRef: vi.fn(), get: vi.fn() },
    activity: { listNotificationsForAuthenticatedUser: vi.fn() },
    graphql: vi.fn(),
  },
  cacheStore: new Map<string, unknown>(),
}));

vi.mock("./github-client.js", () => ({
  getClient: async () => mockOctokit,
  getInstance: async (id: string) => ({
    id,
    label: id,
    baseUrl: "https://api.github.com",
    token: "t",
    username: "alice",
  }),
}));

const cacheTimes = new Map<string, number>();
vi.mock("./cache.js", () => ({
  getCached: (key: string) => cacheStore.get(key) ?? null,
  setCached: (key: string, data: unknown) => {
    cacheStore.set(key, data);
    cacheTimes.set(key, Date.now());
  },
  cacheAge: (key: string) => {
    const t = cacheTimes.get(key);
    return t == null ? null : Date.now() - t;
  },
}));

const { fetchPrs, fetchNotifications, fetchReviews, notificationHtmlUrl } =
  await import("./fetchers.js");

beforeEach(() => {
  vi.clearAllMocks();
  cacheStore.clear();
  // Safe defaults
  mockOctokit.pulls.listReviews.mockResolvedValue({ data: [] });
  mockOctokit.issues.listEventsForTimeline.mockResolvedValue({ data: [] });
  mockOctokit.repos.get.mockResolvedValue({
    data: { allow_auto_merge: false },
  });
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
      requested_reviewers: [],
      requested_teams: [],
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

  it("populates mergeQueue + autoMerge + reviewDecision + threads from GraphQL", async () => {
    mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
      data: { items: [prSearchItem()] },
    });
    mockOctokit.graphql.mockResolvedValue({
      pr0: {
        id: "PR_1",
        mergeQueueEntry: { id: "MQ_1" },
        autoMergeRequest: { enabledAt: "x" },
        reviewDecision: "APPROVED",
        mergeStateStatus: "BLOCKED",
        reviewThreads: {
          nodes: [
            { isResolved: false },
            { isResolved: false },
            { isResolved: true },
          ],
        },
      },
    });
    const prs = await fetchPrs("github");
    expect(prs[0]).toMatchObject({
      inMergeQueue: true,
      autoMerge: true,
      reviewDecision: "APPROVED",
      mergeStateStatus: "BLOCKED",
      unresolvedThreadCount: 2,
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
      mergeStateStatus: null,
      unresolvedThreadCount: 0,
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

  it("attaches autoMergeAllowed from repo settings and caches per repo", async () => {
    mockOctokit.repos.get.mockResolvedValue({
      data: { allow_auto_merge: true },
    });
    mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
      data: {
        items: [
          prSearchItem(),
          prSearchItem({ id: 2, node_id: "PR_2", number: 6 }),
        ],
      },
    });
    const prs = await fetchPrs("github");
    expect(prs.map((p) => p.autoMergeAllowed)).toEqual([true, true]);
    // Both PRs share the same repo — settings call should hit cache after the first.
    expect(mockOctokit.repos.get).toHaveBeenCalledTimes(1);
  });

  it("defaults autoMergeAllowed to false when repos.get fails", async () => {
    mockOctokit.repos.get.mockRejectedValue(new Error("403"));
    mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
      data: { items: [prSearchItem()] },
    });
    const prs = await fetchPrs("github");
    expect(prs[0].autoMergeAllowed).toBe(false);
  });
});

describe("fetchNotifications", () => {
  // fetchNotifications fans out across multiple pages — first call returns
  // the test data, subsequent pages are empty.
  const setNotifications = (data: unknown[]) => {
    mockOctokit.activity.listNotificationsForAuthenticatedUser
      .mockResolvedValueOnce({ data })
      .mockResolvedValue({ data: [] });
  };

  it("omits notifications already represented elsewhere in the dashboard", async () => {
    setNotifications([
      {
        id: "keep-mention",
        subject: { title: "x", type: "PullRequest", url: "http://x" },
        reason: "mention",
        repository: { full_name: "o/r" },
        updated_at: "2026-01-01T00:00:00Z",
        unread: true,
      },
      {
        id: "keep-author-issue",
        subject: { title: "issue I opened", type: "Issue", url: "http://i" },
        reason: "author",
        repository: { full_name: "o/r" },
        updated_at: "2026-01-01T00:00:00Z",
        unread: true,
      },
      {
        id: "drop-review-requested",
        subject: { title: "y", type: "PullRequest", url: "http://y" },
        reason: "review_requested",
        repository: { full_name: "o/r" },
        updated_at: "2026-01-02T00:00:00Z",
        unread: true,
      },
      {
        id: "drop-ci",
        subject: { title: "z", type: "CheckSuite", url: null },
        reason: "ci_activity",
        repository: { full_name: "o/r" },
        updated_at: "2026-01-03T00:00:00Z",
        unread: true,
      },
      {
        id: "drop-author-pr",
        subject: { title: "my pr", type: "PullRequest", url: "http://p" },
        reason: "author",
        repository: { full_name: "o/r" },
        updated_at: "2026-01-04T00:00:00Z",
        unread: true,
      },
      {
        id: "drop-state-change-pr",
        subject: { title: "merged pr", type: "PullRequest", url: "http://m" },
        reason: "state_change",
        repository: { full_name: "o/r" },
        updated_at: "2026-01-05T00:00:00Z",
        unread: true,
      },
      {
        id: "drop-subscribed",
        subject: { title: "sub", type: "Issue", url: "http://s" },
        reason: "subscribed",
        repository: { full_name: "o/r" },
        updated_at: "2026-01-06T00:00:00Z",
        unread: true,
      },
    ]);
    const notifs = await fetchNotifications("github");
    expect(notifs.map((n) => n.id)).toEqual([
      "keep-mention",
      "keep-author-issue",
    ]);
  });

  it("shapes the payload for the UI and rewrites the subject URL to its HTML form", async () => {
    setNotifications([
      {
        id: "1",
        subject: {
          title: "hello",
          type: "Issue",
          url: "https://api.github.com/repos/o/r/issues/42",
        },
        reason: "mention",
        repository: { full_name: "o/r" },
        updated_at: "2026-01-01T00:00:00Z",
        unread: false,
      },
    ]);
    const [n] = await fetchNotifications("github");
    expect(n).toEqual({
      id: "1",
      title: "hello",
      type: "Issue",
      reason: "mention",
      repo: "o/r",
      updatedAt: "2026-01-01T00:00:00Z",
      unread: false,
      url: "https://github.com/o/r/issues/42",
    });
  });

  it("fans out across multiple pages and merges the results", async () => {
    const make = (id: string) => ({
      id,
      subject: { title: id, type: "Issue", url: `http://i/${id}` },
      reason: "mention",
      repository: { full_name: "o/r" },
      updated_at: "2026-01-01T00:00:00Z",
      unread: true,
    });
    mockOctokit.activity.listNotificationsForAuthenticatedUser
      .mockResolvedValueOnce({ data: [make("p1-a"), make("p1-b")] })
      .mockResolvedValueOnce({ data: [make("p2-a")] })
      .mockResolvedValueOnce({ data: [make("p3-a")] });

    const notifs = await fetchNotifications("github");
    expect(notifs.map((n) => n.id)).toEqual(["p1-a", "p1-b", "p2-a", "p3-a"]);
    expect(
      mockOctokit.activity.listNotificationsForAuthenticatedUser,
    ).toHaveBeenCalledTimes(3);
  });
});

describe("notificationHtmlUrl", () => {
  const apiBase = "https://api.github.com";

  it("rewrites issue API URLs to HTML form", () => {
    expect(
      notificationHtmlUrl(
        "https://api.github.com/repos/o/r/issues/42",
        "Issue",
        "o/r",
        apiBase,
      ),
    ).toBe("https://github.com/o/r/issues/42");
  });

  it("rewrites pulls API URLs (pulls → pull) for PRs", () => {
    expect(
      notificationHtmlUrl(
        "https://api.github.com/repos/o/r/pulls/123",
        "PullRequest",
        "o/r",
        apiBase,
      ),
    ).toBe("https://github.com/o/r/pull/123");
  });

  it("rewrites commits API URLs (commits → commit)", () => {
    expect(
      notificationHtmlUrl(
        "https://api.github.com/repos/o/r/commits/abc123",
        "Commit",
        "o/r",
        apiBase,
      ),
    ).toBe("https://github.com/o/r/commit/abc123");
  });

  it("falls back to the repo's releases page for Release subjects (the ID isn't UI-routable)", () => {
    expect(
      notificationHtmlUrl(
        "https://api.github.com/repos/o/r/releases/999",
        "Release",
        "o/r",
        apiBase,
      ),
    ).toBe("https://github.com/o/r/releases");
  });

  it("falls back to the repo's discussions page when subject.url is missing (Discussion)", () => {
    expect(notificationHtmlUrl(null, "Discussion", "o/r", apiBase)).toBe(
      "https://github.com/o/r/discussions",
    );
  });

  it("falls back to the repo page when subject.url is missing and type is unknown", () => {
    expect(notificationHtmlUrl(null, "CheckSuite", "o/r", apiBase)).toBe(
      "https://github.com/o/r",
    );
  });

  it("handles GHES URLs by stripping the /api/v3 prefix and keeping the host", () => {
    expect(
      notificationHtmlUrl(
        "https://ghe.example.com/api/v3/repos/o/r/pulls/7",
        "PullRequest",
        "o/r",
        "https://ghe.example.com/api/v3",
      ),
    ).toBe("https://ghe.example.com/o/r/pull/7");
  });

  it("falls back to the repo page when subject.url is unparseable", () => {
    expect(notificationHtmlUrl("not a url", "Issue", "o/r", apiBase)).toBe(
      "https://github.com/o/r",
    );
  });

  it("appends an issuecomment fragment when latest_comment_url points at an issue comment", () => {
    expect(
      notificationHtmlUrl(
        "https://api.github.com/repos/o/r/issues/42",
        "Issue",
        "o/r",
        apiBase,
        "https://api.github.com/repos/o/r/issues/comments/9001",
      ),
    ).toBe("https://github.com/o/r/issues/42#issuecomment-9001");
  });

  it("appends a discussion_r fragment for PR review comments", () => {
    expect(
      notificationHtmlUrl(
        "https://api.github.com/repos/o/r/pulls/7",
        "PullRequest",
        "o/r",
        apiBase,
        "https://api.github.com/repos/o/r/pulls/comments/555",
      ),
    ).toBe("https://github.com/o/r/pull/7#discussion_r555");
  });

  it("appends a commitcomment fragment for commit comments", () => {
    expect(
      notificationHtmlUrl(
        "https://api.github.com/repos/o/r/commits/abc",
        "Commit",
        "o/r",
        apiBase,
        "https://api.github.com/repos/o/r/comments/77",
      ),
    ).toBe("https://github.com/o/r/commit/abc#commitcomment-77");
  });

  it("handles GHES comment URLs by stripping the /api/v3 prefix", () => {
    expect(
      notificationHtmlUrl(
        "https://ghe.example.com/api/v3/repos/o/r/pulls/7",
        "PullRequest",
        "o/r",
        "https://ghe.example.com/api/v3",
        "https://ghe.example.com/api/v3/repos/o/r/issues/comments/12",
      ),
    ).toBe("https://ghe.example.com/o/r/pull/7#issuecomment-12");
  });

  it("ignores latest_comment_url when it doesn't match a known shape", () => {
    expect(
      notificationHtmlUrl(
        "https://api.github.com/repos/o/r/issues/42",
        "Issue",
        "o/r",
        apiBase,
        "https://api.github.com/repos/o/r/reviews/9001",
      ),
    ).toBe("https://github.com/o/r/issues/42");
  });

  it("does not append a comment fragment when falling back to a list page (Release)", () => {
    expect(
      notificationHtmlUrl(
        "https://api.github.com/repos/o/r/releases/999",
        "Release",
        "o/r",
        apiBase,
        "https://api.github.com/repos/o/r/issues/comments/9001",
      ),
    ).toBe("https://github.com/o/r/releases");
  });
});

describe("fetchReviews — autoAssigned", () => {
  // getInstance mock at the top of the file returns username "alice".
  const USERNAME = "alice";
  const PR_AUTHOR = "bob";
  const PR_CREATED_AT = "2026-01-01T00:00:00Z";

  type Reviewer = { login: string };
  type Team = { slug: string };
  type TimelineEvent = {
    event: string;
    actor?: { login: string; type?: string };
    requested_reviewer?: Reviewer | null;
    requested_team?: Team | null;
    created_at?: string;
  };

  function setup(opts: {
    requestedReviewers?: Reviewer[];
    requestedTeams?: Team[];
    timeline?: TimelineEvent[];
    timelineError?: Error;
  }) {
    mockOctokit.search.issuesAndPullRequests.mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            node_id: "PR_1",
            number: 5,
            title: "t",
            html_url: "http://x",
            repository_url: "https://api.github.com/repos/o/r",
            created_at: PR_CREATED_AT,
            updated_at: "2026-01-02T00:00:00Z",
            user: { login: PR_AUTHOR, avatar_url: "" },
            draft: false,
          },
        ],
      },
    });
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
        requested_reviewers: opts.requestedReviewers ?? [],
        requested_teams: opts.requestedTeams ?? [],
      },
    });
    if (opts.timelineError) {
      mockOctokit.issues.listEventsForTimeline.mockRejectedValue(
        opts.timelineError,
      );
    } else {
      mockOctokit.issues.listEventsForTimeline.mockResolvedValue({
        data: opts.timeline ?? [],
      });
    }
  }

  async function getAutoAssigned() {
    const reviews = await fetchReviews("github");
    return reviews[0].autoAssigned;
  }

  describe("direct path (user is in requested_reviewers)", () => {
    const direct = (
      actor: { login: string; type?: string },
      created_at?: string,
    ): TimelineEvent => ({
      event: "review_requested",
      actor,
      requested_reviewer: { login: USERNAME },
      created_at,
    });

    it("auto when PR author requests the user at PR creation", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [direct({ login: PR_AUTHOR }, PR_CREATED_AT)],
      });
      expect(await getAutoAssigned()).toBe(true);
    });

    it("auto when PR author requests the user within 2s of creation (boundary)", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [direct({ login: PR_AUTHOR }, "2026-01-01T00:00:01.500Z")],
      });
      expect(await getAutoAssigned()).toBe(true);
    });

    it("manual when PR author requests the user >2s after creation", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [direct({ login: PR_AUTHOR }, "2026-01-01T00:00:03Z")],
      });
      expect(await getAutoAssigned()).toBe(false);
    });

    it("manual when PR author manually requests the user much later", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [direct({ login: PR_AUTHOR }, "2026-01-01T00:10:00Z")],
      });
      expect(await getAutoAssigned()).toBe(false);
    });

    it("manual when a non-author human requests the user, even at PR creation", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [direct({ login: "dave" }, PR_CREATED_AT)],
      });
      expect(await getAutoAssigned()).toBe(false);
    });

    it("auto when a Bot-type actor requests the user (any timing)", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [
          direct(
            { login: "some-app[bot]", type: "Bot" },
            "2026-01-01T05:00:00Z",
          ),
        ],
      });
      expect(await getAutoAssigned()).toBe(true);
    });

    it("auto when actor login ends in [bot] even without a type field", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [
          direct({ login: "github-actions[bot]" }, "2026-01-01T05:00:00Z"),
        ],
      });
      expect(await getAutoAssigned()).toBe(true);
    });

    it("manual when the only event targeting the user was added manually, even if other auto events exist for other reviewers", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [
          // Auto event, but for someone else
          {
            event: "review_requested",
            actor: { login: PR_AUTHOR },
            requested_reviewer: { login: "carol" },
            created_at: PR_CREATED_AT,
          },
          // Manual event targeting the user
          direct({ login: "dave" }, "2026-01-01T01:00:00Z"),
        ],
      });
      expect(await getAutoAssigned()).toBe(false);
    });

    it("manual when timeline has no review_requested events targeting the user", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [],
      });
      expect(await getAutoAssigned()).toBe(false);
    });

    it("manual when an auto request was removed and the user was manually re-requested", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [
          // CODEOWNERS auto-attaches the user at PR creation.
          direct({ login: PR_AUTHOR }, PR_CREATED_AT),
          // The user is removed.
          {
            event: "review_request_removed",
            actor: { login: USERNAME },
            requested_reviewer: { login: USERNAME },
            created_at: "2026-01-01T01:00:00Z",
          },
          // A non-author manually re-requests them later.
          direct({ login: "dave" }, "2026-01-01T02:00:00Z"),
        ],
      });
      expect(await getAutoAssigned()).toBe(false);
    });

    it("auto when a manual request was removed and a bot re-attached the user", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [
          direct({ login: "dave" }, "2026-01-01T01:00:00Z"),
          {
            event: "review_request_removed",
            actor: { login: USERNAME },
            requested_reviewer: { login: USERNAME },
            created_at: "2026-01-01T02:00:00Z",
          },
          direct({ login: "github-actions[bot]" }, "2026-01-01T03:00:00Z"),
        ],
      });
      expect(await getAutoAssigned()).toBe(true);
    });
  });

  describe("team path (user only via team membership)", () => {
    const team = (
      actor: { login: string; type?: string },
      created_at?: string,
    ): TimelineEvent => ({
      event: "review_requested",
      actor,
      requested_team: { slug: "platform" },
      created_at,
    });

    const teamSetup = {
      requestedReviewers: [{ login: "carol" }],
      requestedTeams: [{ slug: "platform" }],
    };

    it("auto when PR author requests a team at PR creation", async () => {
      setup({
        ...teamSetup,
        timeline: [team({ login: PR_AUTHOR }, PR_CREATED_AT)],
      });
      expect(await getAutoAssigned()).toBe(true);
    });

    it("manual when PR author requests the team >2s after creation", async () => {
      setup({
        ...teamSetup,
        timeline: [team({ login: PR_AUTHOR }, "2026-01-01T00:00:03Z")],
      });
      expect(await getAutoAssigned()).toBe(false);
    });

    it("manual when a non-author human requests the team", async () => {
      setup({
        ...teamSetup,
        timeline: [team({ login: "dave" }, PR_CREATED_AT)],
      });
      expect(await getAutoAssigned()).toBe(false);
    });

    it("auto when a Bot actor requests the team", async () => {
      setup({
        ...teamSetup,
        timeline: [
          team(
            { login: "github-actions[bot]", type: "Bot" },
            "2026-01-01T05:00:00Z",
          ),
        ],
      });
      expect(await getAutoAssigned()).toBe(true);
    });

    it("manual when an auto team request was removed and a human re-requested the team", async () => {
      setup({
        ...teamSetup,
        timeline: [
          team({ login: PR_AUTHOR }, PR_CREATED_AT),
          {
            event: "review_request_removed",
            actor: { login: "dave" },
            requested_team: { slug: "platform" },
            created_at: "2026-01-01T01:00:00Z",
          },
          team({ login: "dave" }, "2026-01-01T02:00:00Z"),
        ],
      });
      expect(await getAutoAssigned()).toBe(false);
    });
  });

  describe("fallbacks", () => {
    it("false when timeline fetch fails", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timelineError: new Error("404"),
      });
      expect(await getAutoAssigned()).toBe(false);
    });

    it("false when timeline events lack created_at and actor is the PR author", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [
          {
            event: "review_requested",
            actor: { login: PR_AUTHOR },
            requested_reviewer: { login: USERNAME },
            // no created_at
          },
        ],
      });
      expect(await getAutoAssigned()).toBe(false);
    });
  });

  describe("caching", () => {
    const cacheKey = "github:auto-assigned:o/r/5";

    it("skips the timeline fetch when the PR's updated_at matches the cached entry", async () => {
      cacheStore.set(cacheKey, {
        value: true,
        updatedAt: "2026-01-02T00:00:00Z", // matches reviewSearchItem default
      });
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [], // would yield false if it were used
      });
      expect(await getAutoAssigned()).toBe(true);
      expect(mockOctokit.issues.listEventsForTimeline).not.toHaveBeenCalled();
    });

    it("refetches the timeline when the PR's updated_at differs from the cached entry", async () => {
      cacheStore.set(cacheKey, {
        value: true,
        updatedAt: "2025-12-31T00:00:00Z", // stale
      });
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [
          {
            event: "review_requested",
            actor: { login: "dave" }, // non-author manual request
            requested_reviewer: { login: USERNAME },
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      });
      expect(await getAutoAssigned()).toBe(false);
      expect(mockOctokit.issues.listEventsForTimeline).toHaveBeenCalledTimes(1);
      // Cache should now reflect the fresh value and the new updated_at.
      expect(cacheStore.get(cacheKey)).toEqual({
        value: false,
        updatedAt: "2026-01-02T00:00:00Z",
      });
    });

    it("does not write to cache when the timeline fetch fails", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timelineError: new Error("404"),
      });
      expect(await getAutoAssigned()).toBe(false);
      expect(cacheStore.has(cacheKey)).toBe(false);
    });

    it("populates the cache on a cache miss with a successful timeline fetch", async () => {
      setup({
        requestedReviewers: [{ login: USERNAME }],
        timeline: [
          {
            event: "review_requested",
            actor: { login: PR_AUTHOR },
            requested_reviewer: { login: USERNAME },
            created_at: PR_CREATED_AT,
          },
        ],
      });
      expect(await getAutoAssigned()).toBe(true);
      expect(cacheStore.get(cacheKey)).toEqual({
        value: true,
        updatedAt: "2026-01-02T00:00:00Z",
      });
    });
  });
});
