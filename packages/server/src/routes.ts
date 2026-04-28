import { Hono } from "hono";
import { Octokit } from "@octokit/rest";
import { getCached, setCached } from "./cache.js";
import {
  type ConfigSchema,
  configExists,
  getInstances,
  readConfig,
  resolveInstances,
  writeConfig,
} from "./config.js";
import {
  fetchNotifications,
  fetchPrs,
  fetchRecentPrs,
  fetchReviews,
  latestCheckRunsByName,
} from "./fetchers.js";
import { clearClients, getClient, getInstance } from "./github-client.js";
import { scheduleResync } from "./sync.js";

const api = new Hono();

/** Return cached data if available, otherwise fetch live and cache */
async function cachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  fresh = false,
): Promise<T> {
  if (!fresh) {
    const cached = getCached<T>(key);
    if (cached) return cached;
  }
  const data = await fetcher();
  setCached(key, data);
  return data;
}

export function maskToken(token: string): string {
  if (token.length <= 4) return "****";
  return "****" + token.slice(-4);
}

// Config endpoints
api.get("/config", (c) => {
  if (process.env.DEMO === "1") {
    return c.json({
      exists: true,
      config: {
        github: { token: "****demo" },
        enterprise: {
          label: "GHE",
          baseUrl: "https://ghe.example.com/api/v3",
          token: "****demo",
        },
        port: 7100,
      },
    });
  }
  if (!configExists()) {
    return c.json({ exists: false });
  }
  const config = readConfig();
  if (!config) return c.json({ exists: false });

  const masked: ConfigSchema = { ...config };
  if (masked.github?.token) {
    masked.github = { ...masked.github, token: maskToken(masked.github.token) };
  }
  if (masked.enterprise?.token) {
    masked.enterprise = {
      ...masked.enterprise,
      token: maskToken(masked.enterprise.token),
    };
  }
  return c.json({ exists: true, config: masked });
});

api.put("/config", async (c) => {
  const incoming = await c.req.json<ConfigSchema>();
  const existing = readConfig();

  // Empty token string means keep existing
  if (
    incoming.github &&
    incoming.github.token === "" &&
    existing?.github?.token
  ) {
    incoming.github.token = existing.github.token;
  }
  if (
    incoming.enterprise &&
    incoming.enterprise.token === "" &&
    existing?.enterprise?.token
  ) {
    incoming.enterprise.token = existing.enterprise.token;
  }

  // Validate tokens before saving
  const errors: string[] = [];

  if (incoming.github?.token) {
    try {
      const client = new Octokit({
        auth: incoming.github.token,
        baseUrl: "https://api.github.com",
      });
      await client.users.getAuthenticated();
    } catch {
      errors.push("GitHub.com token is invalid");
    }
  }

  if (incoming.enterprise?.token && incoming.enterprise?.baseUrl) {
    try {
      const client = new Octokit({
        auth: incoming.enterprise.token,
        baseUrl: incoming.enterprise.baseUrl,
      });
      await client.users.getAuthenticated();
    } catch {
      errors.push("GitHub Enterprise token is invalid");
    }
  }

  if (errors.length > 0) {
    return c.json({ ok: false, errors }, 422);
  }

  writeConfig(incoming);
  clearClients();

  // Re-resolve usernames from new tokens
  const instances = await resolveInstances();

  // Clear all cached data so next sync/request fetches fresh
  for (const inst of instances) {
    setCached(`${inst.id}:prs`, null);
    setCached(`${inst.id}:reviews`, null);
    setCached(`${inst.id}:notifications`, null);
  }

  return c.json({ ok: true });
});

// List configured instances (no tokens)
api.get("/instances", async (c) => {
  const instances = await getInstances();
  return c.json(
    instances.map((i) => ({ id: i.id, label: i.label, username: i.username })),
  );
});

// Authored PRs with CI + review status
api.get("/:instanceId/prs", async (c) => {
  const { instanceId } = c.req.param();
  const fresh = c.req.query("fresh") === "1";
  const data = await cachedOrFetch(
    `${instanceId}:prs`,
    () => fetchPrs(instanceId),
    fresh,
  );
  return c.json(data);
});

// Recently closed/merged PRs (today)
api.get("/:instanceId/recent-prs", async (c) => {
  const { instanceId } = c.req.param();
  const fresh = c.req.query("fresh") === "1";
  const data = await cachedOrFetch(
    `${instanceId}:recent-prs`,
    () => fetchRecentPrs(instanceId),
    fresh,
  );
  return c.json(data);
});

// PRs awaiting my review
api.get("/:instanceId/reviews", async (c) => {
  const { instanceId } = c.req.param();
  const fresh = c.req.query("fresh") === "1";
  const data = await cachedOrFetch(
    `${instanceId}:reviews`,
    () => fetchReviews(instanceId),
    fresh,
  );
  return c.json(data);
});

// Notifications (participating)
api.get("/:instanceId/notifications", async (c) => {
  const { instanceId } = c.req.param();
  const fresh = c.req.query("fresh") === "1";
  const data = await cachedOrFetch(
    `${instanceId}:notifications`,
    () => fetchNotifications(instanceId),
    fresh,
  );
  return c.json(data);
});

// Mark notification as done
api.delete("/:instanceId/notifications/:threadId", async (c) => {
  const { instanceId, threadId } = c.req.param();
  const client = await getClient(instanceId);

  await client.activity.markThreadAsDone({ thread_id: Number(threadId) });

  // Optimistically remove from cache so it disappears immediately
  const cached = getCached<{ id: string }[]>(`${instanceId}:notifications`);
  if (cached) {
    setCached(
      `${instanceId}:notifications`,
      cached.filter((n) => n.id !== threadId),
    );
  }

  scheduleResync(instanceId, ["notifications"]);

  return c.json({ ok: true });
});

// Approve a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/approve", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const client = await getClient(instanceId);

  await client.pulls.createReview({
    owner,
    repo,
    pull_number: Number(prNumber),
    event: "APPROVE",
  });

  scheduleResync(instanceId, ["prs", "reviews"]);

  return c.json({ ok: true });
});

// Toggle auto-merge on a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/auto-merge", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const client = await getClient(instanceId);
  const num = Number(prNumber);

  const { data: pr } = await client.pulls.get({
    owner,
    repo,
    pull_number: num,
  });

  if (pr.auto_merge) {
    // Disable auto-merge via GraphQL
    await client.graphql(
      `mutation($id: ID!) { disableAutoMerge(input: { pullRequestId: $id }) { pullRequest { id } } }`,
      { id: pr.node_id },
    );
  } else {
    // Enable auto-merge via GraphQL (merge method: squash by default)
    await client.graphql(
      `mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { pullRequest { id } } }`,
      { id: pr.node_id },
    );
  }

  scheduleResync(instanceId, ["prs"]);

  return c.json({ ok: true, autoMerge: !pr.auto_merge });
});

// Close a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/close", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const client = await getClient(instanceId);

  await client.pulls.update({
    owner,
    repo,
    pull_number: Number(prNumber),
    state: "closed",
  });

  scheduleResync(instanceId, ["prs", "reviews", "recent-prs"]);

  return c.json({ ok: true });
});

// Update PR title
api.patch("/:instanceId/prs/:owner/:repo/:prNumber", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const { title } = await c.req.json().catch(() => ({ title: null }));

  if (!title) {
    return c.json({ error: "Title is required" }, 400);
  }

  const client = await getClient(instanceId);

  await client.pulls.update({
    owner,
    repo,
    pull_number: Number(prNumber),
    title,
  });

  scheduleResync(instanceId, ["prs"]);

  return c.json({ ok: true, title });
});

// Toggle draft status on a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/toggle-draft", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const client = await getClient(instanceId);
  const num = Number(prNumber);

  const { data: pr } = await client.pulls.get({
    owner,
    repo,
    pull_number: num,
  });

  // The REST API doesn't support toggling draft, so use GraphQL
  const mutation = pr.draft
    ? `mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`
    : `mutation($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`;

  await client.graphql(mutation, { id: pr.node_id });

  scheduleResync(instanceId, ["prs"]);

  return c.json({ ok: true, draft: !pr.draft });
});

// Rerun CI for a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/rerun-ci", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const client = await getClient(instanceId);
  const num = Number(prNumber);

  const { data: pr } = await client.pulls.get({
    owner,
    repo,
    pull_number: num,
  });

  const runsRes = await client.actions
    .listWorkflowRunsForRepo({
      owner,
      repo,
      head_sha: pr.head.sha,
      per_page: 100,
    })
    .catch(() => null);

  // Keep only the latest attempt per workflow_id, and only for PR-triggered events
  const latestPerWorkflow = new Map<
    number,
    { id: number; status: string; conclusion: string | null }
  >();
  for (const run of runsRes?.data.workflow_runs ?? []) {
    if (run.event !== "pull_request" && run.event !== "pull_request_target") {
      continue;
    }
    const existing = latestPerWorkflow.get(run.workflow_id);
    if (!existing) {
      latestPerWorkflow.set(run.workflow_id, {
        id: run.id,
        status: run.status ?? "",
        conclusion: run.conclusion,
      });
    }
  }

  const candidates = [...latestPerWorkflow.values()].filter(
    (r) => r.status === "completed",
  );

  if (candidates.length === 0) {
    return c.json({ error: "No rerunnable workflow runs found" }, 404);
  }

  const results = await Promise.allSettled(
    candidates.map((run) => {
      const failed =
        run.conclusion === "failure" ||
        run.conclusion === "timed_out" ||
        run.conclusion === "cancelled";
      return failed
        ? client.actions.reRunWorkflowFailedJobs({
            owner,
            repo,
            run_id: run.id,
          })
        : client.actions.reRunWorkflow({ owner, repo, run_id: run.id });
    }),
  );

  const triggered = results.filter((r) => r.status === "fulfilled").length;

  if (triggered === 0) {
    return c.json({ error: "Failed to rerun any workflow" }, 502);
  }

  scheduleResync(instanceId, ["prs"]);

  return c.json({ ok: true, triggered });
});

// Post a comment on a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/comment", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const { body } = await c.req.json<{ body: string }>();
  const client = await getClient(instanceId);
  const num = Number(prNumber);

  await client.issues.createComment({ owner, repo, issue_number: num, body });

  return c.json({ ok: true });
});

// PR metadata for panel + copy menu
api.get("/:instanceId/prs/:owner/:repo/:prNumber/meta", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const client = await getClient(instanceId);
  const num = Number(prNumber);

  const [filesRes, commitsRes, checksRes, statusesRes] = await Promise.all([
    client.pulls.listFiles({ owner, repo, pull_number: num, per_page: 100 }),
    client.pulls.listCommits({ owner, repo, pull_number: num, per_page: 100 }),
    client.checks
      .listForRef({ owner, repo, ref: `pull/${num}/head`, per_page: 100 })
      .catch(() => null),
    client.repos
      .getCombinedStatusForRef({ owner, repo, ref: `pull/${num}/head` })
      .catch(() => null),
  ]);

  const checksByName = new Map<
    string,
    { name: string; status: string; conclusion: string | null }
  >();

  for (const s of statusesRes?.data.statuses ?? []) {
    checksByName.set(s.context, {
      name: s.context,
      status: "completed",
      conclusion:
        s.state === "success"
          ? "success"
          : s.state === "failure" || s.state === "error"
            ? "failure"
            : null,
    });
  }

  for (const cr of latestCheckRunsByName(checksRes?.data.check_runs ?? [])) {
    checksByName.set(cr.name, {
      name: cr.name,
      status: cr.status,
      conclusion: cr.conclusion,
    });
  }

  return c.json({
    files: filesRes.data.map((f) => ({
      filename: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      status: f.status,
      patch: f.patch ?? "",
    })),
    commits: commitsRes.data.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
    })),
    checks: [...checksByName.values()],
  });
});

// PR comments
api.get("/:instanceId/prs/:owner/:repo/:prNumber/comments", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const client = await getClient(instanceId);
  const num = Number(prNumber);

  const [issueComments, reviewComments] = await Promise.all([
    client.issues.listComments({
      owner,
      repo,
      issue_number: num,
      per_page: 100,
    }),
    client.pulls.listReviewComments({
      owner,
      repo,
      pull_number: num,
      per_page: 100,
    }),
  ]);

  const comments = [
    ...issueComments.data.map((c) => ({
      id: c.id,
      author: c.user?.login ?? "unknown",
      body: c.body ?? "",
      createdAt: c.created_at,
      path: null as string | null,
    })),
    ...reviewComments.data.map((c) => ({
      id: c.id,
      author: c.user?.login ?? "unknown",
      body: c.body,
      createdAt: c.created_at,
      path: c.path,
    })),
  ].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return c.json(comments);
});

// Search own closed PR history
api.get("/:instanceId/search/prs", async (c) => {
  const { instanceId } = c.req.param();
  const client = await getClient(instanceId);
  const { username } = await getInstance(instanceId);
  const q = c.req.query("q") ?? "";

  const { data } = await client.search.issuesAndPullRequests({
    q: `author:${username} type:pr state:closed ${q}`,
    sort: "updated",
    order: "desc",
    per_page: 20,
  });

  const prs = data.items.map((item) => {
    const [owner, repo] = item.repository_url.split("/").slice(-2);
    return {
      id: item.id,
      number: item.number,
      title: item.title,
      url: item.html_url,
      repo: `${owner}/${repo}`,
      updatedAt: item.updated_at,
      state: item.state,
    };
  });

  return c.json(prs);
});

// Colleague's open PRs
api.get("/:instanceId/users/:username/prs", async (c) => {
  const { instanceId, username } = c.req.param();
  const client = await getClient(instanceId);

  const { data } = await client.search.issuesAndPullRequests({
    q: `author:${username} type:pr state:open`,
    sort: "updated",
    order: "desc",
    per_page: 20,
  });

  const prs = data.items.map((item) => {
    const [owner, repo] = (item.repository_url ?? "").split("/").slice(-2);
    return {
      id: item.id,
      number: item.number,
      title: item.title ?? "",
      body: item.body ?? "",
      url: item.html_url ?? "",
      repo: `${owner}/${repo}`,
      updatedAt: item.updated_at ?? new Date().toISOString(),
      author: item.user?.login ?? "unknown",
      authorAvatar: item.user?.avatar_url ?? "",
      draft: (item as unknown as { draft?: boolean }).draft ?? false,
      ciStatus: "unknown",
      inMergeQueue: false,
      autoMerge: false,
      headBranch:
        (item as unknown as { head?: { ref?: string } }).head?.ref ?? "",
      baseBranch:
        (item as unknown as { base?: { ref?: string } }).base?.ref ?? "",
      reviews: { approved: [], changesRequested: [] },
      additions: 0,
      deletions: 0,
      commits: 0,
      commentCount: 0,
      labels: [],
    };
  });

  return c.json(prs);
});

export { api };
