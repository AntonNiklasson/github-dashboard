import { Hono } from "hono";
import {
  createConfigFromExample,
  exampleConfig,
  getConfigStatus,
  invalidateConfigStatus,
  openInDefaultApp,
  readConfig,
  resolveConfigPath,
} from "./config.js";
import {
  getSync,
  listData,
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

api.get("/sync/health", async (c) => {
  if (process.env.DEMO === "1") return c.json([]);
  const engine = getSync();
  await engine.reconcileConfiguration();
  return c.json(engine.getHealth());
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

// File diffs and comments use the same engine APIs as the TUI.
api.get("/:instanceId/prs/:owner/:repo/:prNumber/diff", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  return c.json(
    await getSync().getPullRequestDiff({
      instanceId,
      repo: `${owner}/${repo}`,
      number: Number(prNumber),
    }),
  );
});

api.get("/:instanceId/prs/:owner/:repo/:prNumber/comments", async (c) => {
  const { instanceId, owner, repo, prNumber } = c.req.param();
  return c.json(
    await getSync().getPullRequestComments({
      instanceId,
      repo: `${owner}/${repo}`,
      number: Number(prNumber),
    }),
  );
});

export { api };
