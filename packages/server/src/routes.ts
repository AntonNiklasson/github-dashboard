import { Hono } from "hono";
import { clearCache } from "./cache.js";
import {
  createConfigFromExample,
  exampleConfig,
  getConfigStatus,
  invalidateConfigStatus,
  openInDefaultApp,
  readConfig,
  resolveConfigPath,
} from "./config.js";
import { clearRepoSettings, latestCheckRunsByName } from "./fetchers.js";
import { clearClients, getClient, getInstance } from "./github-client.js";
import {
  getSync,
  listData,
  recordMutation,
  reloadSyncConfiguration,
  scheduleResync,
} from "./sync.js";

const api = new Hono();

async function configPayload() {
  const status = await getConfigStatus();
  // Strip tokens before sending — the web only needs id/label/username.
  const safeStatus =
    status.kind === "ready"
      ? {
          kind: "ready" as const,
          instances: status.instances.map((i) => ({
            id: i.id,
            label: i.label,
            username: i.username,
          })),
        }
      : status;
  // Theme comes from the permissive read so we can still apply the user's
  // preference even when the config has token/auth errors and the dashboard
  // is parked on the Welcome screen.
  const theme = readConfig()?.theme ?? "system";
  return {
    path: resolveConfigPath(),
    example: exampleConfig,
    theme,
    status: safeStatus,
  };
}

// Single config endpoint. The web hits this on load and again on every
// "Reload config" click; the response carries either the resolved instances
// or a list of errors explaining why the dashboard can't start.
api.get("/config", async (c) => {
  return c.json(await configPayload());
});

api.post("/config/reload", async (c) => {
  invalidateConfigStatus();
  clearClients();
  clearRepoSettings();
  clearCache();
  const payload = await configPayload();
  // Invalid YAML is non-destructive; valid config still reconciles when a
  // rotated token fails auth. Lists cannot be read while config is invalid.
  await reloadSyncConfiguration().catch(() => {});
  return c.json(payload);
});

api.post("/config/create", (c) => {
  const result = createConfigFromExample();
  if (result.created) {
    invalidateConfigStatus();
    openInDefaultApp(result.path);
  }
  return c.json(result);
});

// Authored PRs with CI + review status
api.get("/:instanceId/prs", async (c) => {
  const { instanceId } = c.req.param();
  const fresh = c.req.query("fresh") === "1";
  const data = await listData(instanceId, "prs", fresh);
  return c.json(data);
});

// PRs awaiting my review
api.get("/:instanceId/reviews", async (c) => {
  const { instanceId } = c.req.param();
  const fresh = c.req.query("fresh") === "1";
  const data = await listData(instanceId, "reviews", fresh);
  return c.json(data);
});

// Notifications (participating)
api.get("/:instanceId/notifications", async (c) => {
  const { instanceId } = c.req.param();
  const fresh = c.req.query("fresh") === "1";
  const data = await listData(instanceId, "notifications", fresh);
  return c.json(data);
});

// Mark notification as done
api.delete("/:instanceId/notifications/:threadId", async (c) => {
  const { instanceId, threadId } = c.req.param();
  await getSync().markNotificationDone({ instanceId, id: threadId });

  scheduleResync(instanceId, ["notifications"]);

  return c.json({ ok: true });
});

// Approve a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/approve", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  await getSync().approvePullRequest({
    instanceId,
    repo: `${owner}/${repo}`,
    number: Number(prNumber),
  });

  scheduleResync(instanceId, ["prs", "reviews"]);

  return c.json({ ok: true });
});

// Toggle auto-merge on a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/auto-merge", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  try {
    const result = await getSync().togglePullRequestAutoMerge({
      instanceId,
      repo: `${owner}/${repo}`,
      number: Number(prNumber),
    });
    scheduleResync(instanceId, ["prs", "reviews"]);
    return c.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/auto.?merge is not allowed/i.test(msg))
      return c.json({ error: "auto_merge_not_allowed" }, 422);
    throw err;
  }
});

// Merge a PR directly (squash)
api.post("/:instanceId/prs/:owner/:repo/:prNumber/merge", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const num = Number(prNumber);
  const fullRepo = `${owner}/${repo}`;
  const identity = await getInstance(instanceId);
  const client = await getClient(instanceId);

  try {
    await client.pulls.merge({
      owner,
      repo,
      pull_number: num,
      merge_method: "squash",
    });
  } catch (err) {
    // GitHub's message is often multi-line: a generic header
    // ("Repository rule violations found") followed by the actionable
    // detail ("A conversation must be resolved…"). Join non-empty lines
    // so the toast carries the reason, not just the header.
    const e = err as { response?: { data?: { message?: string } } };
    const raw = e.response?.data?.message;
    const message = raw
      ? raw
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
          .join(" — ")
      : "Failed to merge PR";
    return c.json({ error: "merge_rejected", message }, 422);
  }

  await recordMutation(
    instanceId,
    {
      kind: "removed",
      repo: fullRepo,
      number: num,
    },
    identity,
  );
  scheduleResync(instanceId, ["prs", "reviews"]);

  return c.json({ ok: true });
});

// Close a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/close", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const num = Number(prNumber);
  const fullRepo = `${owner}/${repo}`;
  const identity = await getInstance(instanceId);
  const client = await getClient(instanceId);

  await client.pulls.update({
    owner,
    repo,
    pull_number: num,
    state: "closed",
  });

  await recordMutation(
    instanceId,
    {
      kind: "removed",
      repo: fullRepo,
      number: num,
    },
    identity,
  );
  scheduleResync(instanceId, ["prs", "reviews"]);

  return c.json({ ok: true });
});

// Update PR title
api.patch("/:instanceId/prs/:owner/:repo/:prNumber", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const { title } = await c.req.json().catch(() => ({ title: null }));

  if (!title) {
    return c.json({ error: "Title is required" }, 400);
  }

  const identity = await getInstance(instanceId);
  const client = await getClient(instanceId);

  await client.pulls.update({
    owner,
    repo,
    pull_number: Number(prNumber),
    title,
  });

  await recordMutation(
    instanceId,
    {
      kind: "patch",
      repo: `${owner}/${repo}`,
      number: Number(prNumber),
      patch: { title },
    },
    identity,
  );
  scheduleResync(instanceId, ["prs", "reviews"]);

  return c.json({ ok: true, title });
});

// Toggle draft status on a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/toggle-draft", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const result = await getSync().togglePullRequestDraft({
    instanceId,
    repo: `${owner}/${repo}`,
    number: Number(prNumber),
  });
  scheduleResync(instanceId, ["prs", "reviews"]);
  return c.json({ ok: true, ...result });
});

// Rerun CI for a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/rerun-ci", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const identity = await getInstance(instanceId);
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

  await recordMutation(
    instanceId,
    {
      kind: "patch",
      repo: `${owner}/${repo}`,
      number: num,
      patch: { ciStatus: "pending" },
    },
    identity,
  );
  scheduleResync(instanceId, ["prs", "reviews"]);

  return c.json({ ok: true, triggered });
});

// Post a comment on a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/comment", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  const { body } = await c.req.json<{ body: string }>();
  const client = await getClient(instanceId);
  const num = Number(prNumber);

  await client.issues.createComment({ owner, repo, issue_number: num, body });
  scheduleResync(instanceId, ["prs", "reviews"]);

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
      inReplyToId: null as number | null,
    })),
    ...reviewComments.data.map((c) => ({
      id: c.id,
      author: c.user?.login ?? "unknown",
      body: c.body,
      createdAt: c.created_at,
      path: c.path,
      inReplyToId: c.in_reply_to_id ?? null,
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
