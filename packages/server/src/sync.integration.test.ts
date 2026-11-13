import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSync } from "sync";

let root: string;
let github: Server;
let domain: string;
let id: string;
let requests: string[];
let fail: boolean;
let api: (typeof import("./routes.js"))["api"];
let runtime: typeof import("./sync.js");
const node = {
  id: "PR_node",
  databaseId: null,
  number: 5,
  title: "Rich PR",
  body: "Description",
  url: "https://example.com/o/r/pull/5",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  isDraft: true,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  reviewDecision: "APPROVED",
  additions: 10,
  deletions: 2,
  headRefName: "feature",
  baseRefName: "main",
  author: { login: "alice", avatarUrl: "avatar" },
  repository: { nameWithOwner: "o/r", autoMergeAllowed: true },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
  reviews: { nodes: [{ state: "APPROVED", author: { login: "bob" } }] },
  reviewThreads: {
    totalCount: 1,
    nodes: [{ isResolved: false, comments: { totalCount: 2 } }],
  },
  autoMergeRequest: { enabledAt: "now" },
  mergeQueueEntry: { id: "queue" },
  labels: { nodes: [{ name: "bug" }] },
  comments: { totalCount: 3 },
  commitsTotal: { totalCount: 4 },
};
function config(token = "fake", instances = true) {
  writeFileSync(
    join(root, "config/github-dashboard/config.yml"),
    instances
      ? `instances:\n  - domain: ${domain}\n    token: ${token}\n`
      : "instances: []\n",
  );
}
beforeEach(async () => {
  vi.resetModules();
  root = mkdtempSync(join(tmpdir(), "ghd-server-sync-"));
  vi.stubEnv("XDG_CONFIG_HOME", join(root, "config"));
  vi.stubEnv("XDG_CACHE_HOME", join(root, "cache"));
  vi.stubEnv("DEMO", "0");
  mkdirSync(join(root, "config/github-dashboard"), { recursive: true });
  requests = [];
  fail = false;
  github = createServer(async (req, res) => {
    requests.push(req.url!);
    let body = "";
    for await (const chunk of req) body += chunk;
    res.setHeader("content-type", "application/json");
    if (
      req.headers.authorization === "token rotated" ||
      req.headers.authorization === "bearer rotated"
    ) {
      res.writeHead(401).end(JSON.stringify({ message: "Bad credentials" }));
    } else if (fail) {
      res.writeHead(500).end(JSON.stringify({ message: "Unavailable" }));
    } else if (req.url?.endsWith("/user")) {
      res.end(JSON.stringify({ login: "alice" }));
    } else if (req.url?.endsWith("/graphql")) {
      const query = JSON.parse(body).query as string;
      if (query.includes("mutation")) res.end(JSON.stringify({ data: {} }));
      else
        res.end(
          JSON.stringify({
            data: {
              search: { nodes: [node] },
              rateLimit: {
                cost: 1,
                remaining: 5000,
                resetAt: "2099-01-01T00:00:00Z",
              },
            },
          }),
        );
    } else if (req.url?.endsWith("/pulls/5")) {
      res.end(JSON.stringify({ node_id: "PR_node", draft: true }));
    } else if (req.url?.includes("/notifications")) {
      res.setHeader("etag", '"v1"');
      res.end(
        JSON.stringify([
          {
            id: "42",
            reason: "mention",
            unread: true,
            updated_at: "2026-01-02T00:00:00Z",
            subject: {
              title: "Mention",
              type: "Issue",
              url: "https://api.github.com/repos/o/r/issues/5",
              latest_comment_url: null,
            },
            repository: { full_name: "o/r" },
          },
        ]),
      );
    } else res.end("{}");
  });
  await new Promise<void>((resolve) => github.listen(0, "127.0.0.1", resolve));
  const address = github.address() as { port: number };
  domain = `http://127.0.0.1:${address.port}`;
  id = `127-0-0-1-${address.port}`;
  config();
  ({ api } = await import("./routes.js"));
  runtime = await import("./sync.js");
});
afterEach(async () => {
  await runtime.stopSync();
  await new Promise<void>((resolve) => github.close(() => resolve()));
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

it("serves rich shared snapshots, persists across engines, supports targeted fresh and preserves data on failure", async () => {
  const first = await api.request(`/${id}/prs`);
  expect(first.status).toBe(200);
  const rich = await first.json();
  expect(rich[0]).toMatchObject({
    id: "PR_node",
    body: "Description",
    createdAt: node.createdAt,
    authorAvatar: "avatar",
    labels: ["bug"],
    autoMergeAllowed: true,
    inMergeQueue: true,
    autoMerge: true,
    reviewDecision: "APPROVED",
    mergeStateStatus: "CLEAN",
    unresolvedThreadCount: 1,
    headBranch: "feature",
    baseBranch: "main",
    ciStatus: "success",
    mergeable: true,
    additions: 10,
    deletions: 2,
    commits: 4,
    commentCount: 5,
    reviews: { approved: ["bob"], changesRequested: [] },
  });
  const count = requests.length;
  expect(await (await api.request(`/${id}/prs`)).json()).toEqual(rich);
  expect(requests).toHaveLength(count);
  const other = createSync();
  expect(other.listPullRequests(id, "prs")).toEqual(rich);
  await other.close();
  expect((await api.request(`/${id}/reviews?fresh=1`)).status).toBe(200);
  expect((await api.request(`/${id}/notifications`)).status).toBe(200);
  fail = true;
  expect((await api.request(`/${id}/prs?fresh=1`)).status).toBe(500);
  expect(await (await api.request(`/${id}/prs`)).json()).toEqual(rich);
});

it("serves cached lists while an unrelated instance is blocked authenticating", async () => {
  const cached = await (await api.request(`/${id}/prs`)).json();
  let started!: () => void;
  const began = new Promise<void>((resolve) => (started = resolve));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const unrelated = createServer(async (_req, res) => {
    started();
    await gate;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ login: "other" }));
  });
  await new Promise<void>((resolve) =>
    unrelated.listen(0, "127.0.0.1", resolve),
  );
  const { port } = unrelated.address() as { port: number };
  writeFileSync(
    join(root, "config/github-dashboard/config.yml"),
    `instances:\n  - domain: ${domain}\n    token: fake\n  - domain: http://127.0.0.1:${port}\n    token: other\n`,
  );
  const pending = runtime.getSync().sync({
    instanceId: `127-0-0-1-${port}`,
    kinds: [],
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await began;
    const response = await Promise.race([
      api.request(`/${id}/prs`),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("cached list blocked")),
          1000,
        );
      }),
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(cached);
    // Local reconciliation preserves the active identity without spending
    // another GitHub request for the cached instance.
    expect(requests).toHaveLength(2);
  } finally {
    clearTimeout(timeout);
    release();
    await pending;
    await new Promise<void>((resolve) => unrelated.close(() => resolve()));
  }
});

it("shared actions cannot be undone by stale fresh/background syncs", async () => {
  await api.request(`/${id}/prs`);
  await api.request(`/${id}/reviews`);
  const toggled = await api.request(`/${id}/prs/o/r/5/toggle-draft`, {
    method: "POST",
  });
  expect(await toggled.json()).toEqual({ ok: true, draft: false });
  await runtime.waitForPendingResyncs();
  for (const kind of ["prs", "reviews"]) {
    expect(
      (await (await api.request(`/${id}/${kind}?fresh=1`)).json())[0].draft,
    ).toBe(false);
  }
});

it("reload purges rotated identity even when the new token fails authentication", async () => {
  await api.request(`/${id}/prs`);
  config("rotated");
  const reload = await api.request("/config/reload", { method: "POST" });
  expect((await reload.json()).status.kind).toBe("error");
  expect(runtime.getSync().listPullRequests(id, "prs")).toEqual([]);
  expect(runtime.getSync().getSyncState(id, "prs")).toBeUndefined();
});

it("invalid YAML is non-destructive but blocks list reads; valid empty config removes old instances", async () => {
  await api.request(`/${id}/prs`);
  writeFileSync(
    join(root, "config/github-dashboard/config.yml"),
    "instances: [",
  );
  expect((await api.request("/config/reload", { method: "POST" })).status).toBe(
    200,
  );
  expect((await api.request(`/${id}/prs`)).status).toBe(500);
  expect(runtime.getSync().listPullRequests(id, "prs")).toHaveLength(1);
  config("fake", false);
  await api.request("/config/reload", { method: "POST" });
  expect(runtime.getSync().listInstances()).toEqual([]);
});
