import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

// Each test spawns several real CLI processes; CI runners need more than the
// 5s default.
vi.setConfig({ testTimeout: 20_000 });

const root = mkdtempSync(join(tmpdir(), "ghd-cli-"));
const env = { ...process.env, XDG_CACHE_HOME: root, XDG_CONFIG_HOME: root };
let port: number;
let failure = false;
let lowBudget = false;
let unchanged = false;
let hold = false;
let hostileTitle = false;
let requested = 0;
const pr = {
  id: "PR_1",
  databaseId: 1,
  number: 1,
  title: "Fix bug",
  body: "",
  url: "https://github.com/o/r/pull/1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  reviewDecision: null,
  additions: 2,
  deletions: 0,
  headRefName: "fix",
  baseRefName: "main",
  author: { login: "tester", avatarUrl: "" },
  repository: { nameWithOwner: "o/r", autoMergeAllowed: true },
  commits: { nodes: [] },
  reviews: { nodes: [] },
  reviewThreads: { nodes: [] },
  autoMergeRequest: null,
  mergeQueueEntry: null,
  labels: { nodes: [] },
  comments: { totalCount: 0 },
  commitsTotal: { totalCount: 1 },
};
const server = createServer((req, res) => {
  requested++;
  const send = (
    code: number,
    data: unknown,
    headers: Record<string, string> = {},
  ) => {
    res.writeHead(code, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(data));
  };
  if (req.url === "/api/v3/user") return send(200, { login: "tester" });
  if (hold) return void setTimeout(() => send(200, []), 300);
  if (req.url?.includes("graphql")) {
    if (failure) return send(500, { message: "upstream unavailable" });
    return send(200, {
      data: {
        search: { nodes: [pr] },
        rateLimit: {
          remaining: lowBudget ? 100 : 400,
          resetAt: "2030-01-01T00:00:00Z",
        },
      },
    });
  }
  if (unchanged && req.headers["if-none-match"])
    return send(304, null, { etag: '"v1"' });
  return send(
    200,
    [
      {
        id: "1",
        reason: "mention",
        unread: true,
        updated_at: "2026-01-01T00:00:00Z",
        subject: {
          title: hostileTitle ? "evil \u001b[2J title" : "hello",
          type: "Issue",
          url: null,
          latest_comment_url: null,
        },
        repository: { full_name: "o/r" },
      },
    ],
    { etag: '"v1"', "x-ratelimit-remaining": "400" },
  );
});
const cli = join(import.meta.dirname, "../dist/index.js");
function run(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    env,
    encoding: "utf8",
    timeout: 5000,
  });
}
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  port = address.port;
  mkdirSync(join(root, "github-dashboard"));
  writeFileSync(
    join(root, "github-dashboard/config.yml"),
    `instances:\n  - domain: http://127.0.0.1:${port}\n    token: fake\n`,
  );
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
});
test("once → offline list, targeted refresh, 304, failed refresh preserves cache", async () => {
  // spawnSync blocks the HTTP server event loop; use asynchronous subprocesses.
  const invoke = (...args: string[]) =>
    new Promise<{ code: number | null; out: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [cli, ...args], { env });
      let out = "";
      child.stdout.on("data", (chunk) => (out += chunk));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, out }));
    });
  const first = await invoke("once", "--kind", "notifications", "--json");
  expect(first.code).toBe(0);
  expect(JSON.parse(first.out).instances[0].notifications[0].title).toBe(
    "hello",
  );
  const prs = await invoke("once", "--kind", "prs", "--json");
  expect(prs.code).toBe(0);
  expect(JSON.parse(prs.out).instances[0].prs[0]).toMatchObject({
    id: 1,
    title: "Fix bug",
    mergeable: true,
  });
  const calls = requested;
  const listed = run("list", "--json");
  expect(listed.status).toBe(0);
  expect(JSON.parse(listed.stdout).instances[0].notifications).toHaveLength(1);
  expect(requested).toBe(calls);
  unchanged = true;
  const second = await invoke("once", "--kind", "notifications", "--json");
  expect(JSON.parse(second.out).cycle.results[0].fetches[0].status).toBe(
    "unchanged",
  );
  failure = true;
  const third = await invoke("once", "--kind", "prs", "--json");
  expect(third.code).toBe(2);
  expect(JSON.parse(third.out).cycle.results[0].fetches[0].status).toBe(
    "failed",
  );
  expect(JSON.parse(third.out).instances[0].prs).toHaveLength(1);
  expect(JSON.parse(third.out).instances[0].notifications).toBeUndefined();
  expect(
    JSON.parse(run("list", "--json").stdout).instances[0].notifications,
  ).toHaveLength(1);
  failure = false;
  lowBudget = true;
  await invoke("once", "--kind", "prs", "--json");
  const callsBeforeSkip = requested;
  const skipped = await invoke("once", "--kind", "reviews", "--json");
  expect(skipped.code).toBe(0);
  expect(JSON.parse(skipped.out).cycle.results[0].fetches[0].status).toBe(
    "skipped",
  );
  // Authentication may run again, but no review GraphQL fetch can consume the shared budget.
  expect(requested - callsBeforeSkip).toBe(1);
});
test("watch stops during sleep and active fetch", async () => {
  for (const active of [false, true]) {
    hold = active;
    const child = spawn(
      process.execPath,
      [cli, "watch", "--kind", "notifications", "--interval", "60", "--json"],
      { env },
    );
    await new Promise<void>((resolve) =>
      child.stdout.once("data", () => resolve()),
    );
    if (active) await new Promise((resolve) => setTimeout(resolve, 50));
    const started = Date.now();
    child.kill("SIGTERM");
    const code = await new Promise<number | null>((resolve) =>
      child.on("close", resolve),
    );
    expect(code).toBe(0);
    expect(Date.now() - started).toBeLessThan(2000);
  }
  hold = false;
});
// Async spawn: spawnSync would block the in-process mock server.
const exec = (...args: string[]) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { env });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", reject);
    child.on("close", () => resolve(out));
  });
test("plain output strips terminal control sequences; JSON keeps them", async () => {
  // Earlier tests leave the mock in 304 / failure modes.
  unchanged = false;
  failure = false;
  hostileTitle = true;
  // Notifications use the REST budget, which earlier tests leave intact.
  const plain = await exec("once", "--kind", "notifications");
  hostileTitle = false;
  expect(plain).toContain("o/r: evil  [2J title");
  expect(plain).not.toContain("\u001b");
  const json = await exec("list", "--kind", "notifications", "--json");
  expect(JSON.parse(json).instances[0].notifications[0].title).toBe(
    "evil \u001b[2J title",
  );
});
test("once drains the in-flight sync on SIGTERM", async () => {
  hold = true;
  const before = requested;
  const child = spawn(
    process.execPath,
    [cli, "once", "--kind", "notifications"],
    { env },
  );
  let stdout = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  // Signal only once the held notifications fetch is in flight.
  await vi.waitFor(() => expect(requested).toBeGreaterThan(before + 1), {
    timeout: 4000,
  });
  child.kill("SIGTERM");
  const [code, signal] = await new Promise<[number | null, string | null]>(
    (resolve) => child.on("close", (c, s) => resolve([c, s])),
  );
  hold = false;
  // Not killed by the signal: the accepted sync finished and was reported.
  expect(signal).toBeNull();
  expect(code).toBe(0);
  expect(stdout).toContain("sync ");
});
