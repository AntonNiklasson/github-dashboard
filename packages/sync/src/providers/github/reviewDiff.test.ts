import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createSync } from "../../index.js";
import { lineRange, parsePatch } from "./reviewDiff.js";

const patch =
  "@@ -10,3 +10,4 @@\n context\n-old\n+new\n+extra\n tail\n\\ No newline at end of file\n@@ -30,1 +31,1 @@\n-before\n+after";
const sha = "a".repeat(40);
const root = mkdtempSync(join(tmpdir(), "ghd-review-"));
const oldCache = process.env.XDG_CACHE_HOME;
let port: number;
let delay = false;
const comments: Array<Record<string, unknown>> = [];
const server = createServer(async (req, res) => {
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url?.endsWith("/pulls/7"))
    return send(200, { head: { sha } });
  if (req.method === "GET" && req.url?.includes("/pulls/7/files"))
    return send(200, [
      { filename: "src/a.ts", patch, status: "modified" },
      { filename: "image.png", status: "added" },
    ]);
  if (req.method === "POST" && req.url?.endsWith("/pulls/7/comments")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (delay) await new Promise((resolve) => setTimeout(resolve, 120));
    comments.push(JSON.parse(body) as Record<string, unknown>);
    return send(201, { id: 1 });
  }
  send(404, { message: "not found" });
});
beforeAll(async () => {
  process.env.XDG_CACHE_HOME = root;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("server unavailable");
  port = address.port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (oldCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = oldCache;
  rmSync(root, { recursive: true, force: true });
});
const runtime = () =>
  createSync({
    loadInstances: () => [
      {
        id: "local",
        label: "Local",
        baseUrl: `http://127.0.0.1:${port}/api/v3`,
        token: "fake",
        username: "tester",
      },
    ],
  });

test("patch coordinates and valid single/multi-line side selection", () => {
  const file = {
    path: "src/a.ts",
    status: "modified",
    lines: parsePatch(patch),
  };
  expect(
    file.lines.map((line) => [line.kind, line.oldLine, line.newLine]),
  ).toEqual([
    ["hunk", undefined, undefined],
    ["context", 10, 10],
    ["delete", 11, undefined],
    ["add", undefined, 11],
    ["add", undefined, 12],
    ["context", 12, 13],
    ["hunk", undefined, undefined],
    ["delete", 30, undefined],
    ["add", undefined, 31],
  ]);
  expect(lineRange(file, 2, 2)).toEqual({
    path: "src/a.ts",
    side: "LEFT",
    startLine: 11,
    endLine: 11,
  });
  expect(lineRange(file, 3, 5)).toEqual({
    path: "src/a.ts",
    side: "RIGHT",
    startLine: 11,
    endLine: 13,
  });
  expect(() => lineRange(file, 2, 3)).toThrow("both sides");
  expect(() => lineRange(file, 5, 8)).toThrow("one diff hunk");
  expect(() => lineRange(file, 0, 0)).toThrow("one diff hunk");
});
test("real runtime fetches diff, posts exact pinned coordinates, drains on close", async () => {
  const sync = runtime();
  const diff = await sync.getPullRequestDiff({
    instanceId: "local",
    repo: "o/r",
    number: 7,
  });
  expect(diff.headSha).toBe(sha);
  expect(diff.files).toHaveLength(2);
  expect(diff.files[1]?.lines).toEqual([]);
  await sync.createReviewComment({
    instanceId: "local",
    repo: "o/r",
    number: 7,
    headSha: diff.headSha,
    range: lineRange(diff.files[0]!, 2, 2),
    body: "  deletion  ",
  });
  delay = true;
  const second = sync.createReviewComment({
    instanceId: "local",
    repo: "o/r",
    number: 7,
    headSha: diff.headSha,
    range: lineRange(diff.files[0]!, 3, 5),
    body: "multiple\nlines",
  });
  const closing = sync.close();
  await expect(
    sync.getPullRequestDiff({ instanceId: "local", repo: "o/r", number: 7 }),
  ).rejects.toThrow("closed");
  await second;
  await closing;
  expect(comments).toEqual([
    expect.objectContaining({
      commit_id: sha,
      path: "src/a.ts",
      side: "LEFT",
      line: 11,
      body: "deletion",
    }),
    expect.objectContaining({
      commit_id: sha,
      path: "src/a.ts",
      side: "RIGHT",
      start_side: "RIGHT",
      start_line: 11,
      line: 13,
      body: "multiple\nlines",
    }),
  ]);
  expect(comments[0]).not.toHaveProperty("start_line");
  delay = false;
});
