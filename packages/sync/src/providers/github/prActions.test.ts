import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { GitHubInstance } from "../../config.js";
import {
  approvePr,
  markNotificationDone,
  togglePrAutoMerge,
  togglePrDraft,
} from "./prActions.js";

let state = { draft: true, auto_merge: null as object | null };
const calls: string[] = [];
const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const send = (code: number, data: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (req.method === "GET" && req.url?.endsWith("/repos/o/r/pulls/7"))
    return send(200, { node_id: "PR_node", ...state });
  if (
    req.method === "POST" &&
    req.url?.endsWith("/repos/o/r/pulls/7/reviews")
  ) {
    calls.push(`review ${(JSON.parse(body) as { event: string }).event}`);
    return send(200, { id: 1 });
  }
  if (
    req.method === "DELETE" &&
    req.url?.endsWith("/notifications/threads/42")
  ) {
    calls.push("done 42");
    res.writeHead(204).end();
    return;
  }
  if (req.method === "POST" && req.url?.endsWith("/graphql")) {
    const { query, variables } = JSON.parse(body) as {
      query: string;
      variables: { id: string };
    };
    calls.push(`${query.match(/\{\s*(\w+)\(/)![1]} ${variables.id}`);
    return send(200, { data: {} });
  }
  send(404, { message: "not found" });
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
beforeEach(() => {
  calls.length = 0;
});
const target = { repo: "o/r", number: 7 };

test("draft toggle reads live state and flips it", async () => {
  state = { draft: true, auto_merge: null };
  expect(await togglePrDraft(instance, target)).toEqual({ draft: false });
  state = { draft: false, auto_merge: null };
  expect(await togglePrDraft(instance, target)).toEqual({ draft: true });
  expect(calls).toEqual([
    "markPullRequestReadyForReview PR_node",
    "convertPullRequestToDraft PR_node",
  ]);
});

test("auto-merge toggle; refuses to arm drafts", async () => {
  state = { draft: false, auto_merge: { merge_method: "squash" } };
  expect(await togglePrAutoMerge(instance, target)).toEqual({
    autoMerge: false,
  });
  state = { draft: false, auto_merge: null };
  expect(await togglePrAutoMerge(instance, target)).toEqual({
    autoMerge: true,
  });
  state = { draft: true, auto_merge: null };
  await expect(togglePrAutoMerge(instance, target)).rejects.toThrow(/draft/);
  expect(calls).toEqual([
    "disablePullRequestAutoMerge PR_node",
    "enablePullRequestAutoMerge PR_node",
  ]);
});

test("approve posts an APPROVE review", async () => {
  await approvePr(instance, target);
  expect(calls).toEqual(["review APPROVE"]);
});

test("rejects malformed targets before any request", async () => {
  for (const repo of ["../x", "./x", "o/..", "o/.", "o/r/x"])
    await expect(togglePrDraft(instance, { repo, number: 7 })).rejects.toThrow(
      "invalid repository identity",
    );
  expect(calls).toEqual([]);
});

test("marks a notification thread done", async () => {
  await markNotificationDone(instance, "42");
  await expect(markNotificationDone(instance, "../1")).rejects.toThrow();
  expect(calls).toEqual(["done 42"]);
});
