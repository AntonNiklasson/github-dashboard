import { createServer } from "node:http";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { GitHubInstance } from "../../config.js";
import { fetchPullRequestComments } from "./comments.js";

const server = createServer((req, res) => {
  const send = (data: unknown) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (req.url?.startsWith("/repos/o/r/issues/7/comments"))
    return send([
      {
        id: 1,
        user: { login: "a" },
        body: "late",
        created_at: "2026-01-03T00:00:00Z",
      },
    ]);
  if (req.url?.startsWith("/repos/o/r/pulls/7/comments"))
    return send([
      {
        id: 2,
        user: { login: "b" },
        body: "inline",
        created_at: "2026-01-01T00:00:00Z",
        path: "src/a.ts",
        line: 4,
      },
      {
        id: 3,
        user: null,
        body: "reply",
        created_at: "2026-01-02T00:00:00Z",
        path: "src/a.ts",
        original_line: 4,
        in_reply_to_id: 2,
      },
    ]);
  res.writeHead(404).end("{}");
});
let instance: GitHubInstance;
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  instance = {
    id: "t",
    label: "t",
    baseUrl: `http://127.0.0.1:${port}`,
    token: "t",
  } as GitHubInstance;
});
afterAll(() => server.close());

test("merges conversation and review comments chronologically", async () => {
  const comments = await fetchPullRequestComments(instance, "o/r", 7);
  expect(
    comments.map((c) => [c.id, c.author, c.path, c.line, c.inReplyToId]),
  ).toEqual([
    [2, "b", "src/a.ts", 4, null],
    [3, "unknown", "src/a.ts", 4, 2],
    [1, "a", null, null, null],
  ]);
});
