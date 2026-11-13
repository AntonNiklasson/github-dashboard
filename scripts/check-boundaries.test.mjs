import { test } from "node:test";
import assert from "node:assert/strict";
import { violations, checkRepository } from "./check-boundaries.mjs";

test("production clients use the public sync boundary", () =>
  assert.deepEqual(checkRepository(), []));
test("rejects direct clients, aliases, computed fetch, and internal imports", () => {
  for (const source of [
    'import { Octokit } from "@octokit/rest";',
    'const upstream = fetch; upstream("https://api.github.com");',
    'globalThis["fetch"]("https://api.github.com");',
    'import("node:https");',
    'import { getClient } from "../../sync/src/providers/github/client";',
    'export * from "sync/providers/github";',
  ])
    assert.ok(
      violations("packages/server/src/routes.ts", source).length,
      source,
    );
});
test("allows local renderer transport and rejects absolute requests", () => {
  assert.deepEqual(
    violations(
      "packages/web/src/api.ts",
      'fetchJson(`/api/${id}/prs`); fetch("/api/config");',
    ),
    [],
  );
  assert.ok(
    violations(
      "packages/web/src/api.ts",
      'fetch("https://api.github.com/user");',
    ).length,
  );
  assert.ok(
    violations("packages/web/src/App.tsx", 'fetch("/api/config");').length,
  );
});

test("does not confuse payload properties or local outcome variables with global fetch", () => {
  assert.deepEqual(
    violations(
      "packages/cli/src/tui.tsx",
      "for (const fetch of result.fetches) console.log(fetch.status); serve({ fetch: app.fetch });",
    ),
    [],
  );
});
