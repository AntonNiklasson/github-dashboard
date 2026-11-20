import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { createSync } from "./index.js";
import { openCache } from "./cache/open.js";
import { createStore } from "./cache/store.js";

// Rate-limit metadata is what routes budget writes through the error path.
const { fetchError, hooks } = vi.hoisted(() => ({
  fetchError: Object.assign(new Error("rate limit exceeded"), {
    response: {
      headers: {
        "x-ratelimit-remaining": "12",
        "x-ratelimit-reset": "9999999999",
      },
    },
  }),
  hooks: { onFetch: async () => {} },
}));
vi.mock("./providers/github/fetchPrs.js", () => ({
  fetchAuthoredPrs: async () => {
    await hooks.onFetch();
    throw fetchError;
  },
}));
vi.mock("./providers/github/fetchReviews.js", () => ({
  fetchReviews: async () => {
    throw fetchError;
  },
}));
vi.mock("./providers/github/fetchNotifications.js", () => ({
  fetchNotifications: async () => {
    throw fetchError;
  },
}));

const root = mkdtempSync(join(tmpdir(), "ghd-budget-"));
const old = process.env.XDG_CACHE_HOME;
beforeEach(() => {
  process.env.XDG_CACHE_HOME = root;
});
const credentials = {
  id: "budgeted",
  label: "Budgeted",
  baseUrl: "http://127.0.0.1:1",
  token: "old",
  username: "tester",
};

test.each(["rotated", "removed"] as const)(
  "a late rate-limit error cannot publish a %s identity's budget",
  async (change) => {
    const { username: _unused, ...instance } = credentials;
    let configured = [{ ...instance, username: "old-login" }];
    hooks.onFetch = async () => {
      configured =
        change === "rotated"
          ? [{ ...instance, username: "old-login", token: "rotated" }]
          : [];
      const peer = createSync({ loadInstances: () => configured });
      await peer.sync({ kinds: [] });
      await peer.close();
    };
    const sync = createSync({
      loadInstances: () => configured,
      authenticate: async () => "old-login",
    });
    try {
      const pending = sync.sync();
      const result = await pending;
      // The cycle must not abort on a foreign-key violation.
      expect(
        result.results[0].fetches.every((f) => f.status === "failed"),
      ).toBe(true);
      const { db } = openCache();
      const store = createStore(db);
      // The stale credential's budget must not throttle the replacement.
      expect(store.budget(credentials.id, "graphql")).toBeUndefined();
      expect(store.budget(credentials.id, "rest")).toBeUndefined();
      db.close();
    } finally {
      hooks.onFetch = async () => {};
      await sync.close();
    }
  },
);

test("recordMutation keeps an accepted remote action when the instance is gone", async () => {
  const sync = createSync({ loadInstances: () => [] });
  try {
    await expect(
      sync.recordMutation(
        "gone",
        { kind: "removed", repo: "o/r", number: 1 },
        { baseUrl: credentials.baseUrl, token: credentials.token },
      ),
    ).resolves.toBeUndefined();
    // Without a captured identity there is no accepted write to protect.
    await expect(
      sync.recordMutation("gone", {
        kind: "removed",
        repo: "o/r",
        number: 2,
      }),
    ).rejects.toThrow("unknown instance: gone");
  } finally {
    await sync.close();
  }
});

test("recordMutation publishes a patch only for the writing identity", async () => {
  const { username, ...base } = credentials;
  let configured = [{ ...base, username, token: "rotated" }];
  const sync = createSync({ loadInstances: () => configured });
  await sync.sync({ kinds: [] });
  const { db } = openCache();
  const store = createStore(db);
  const pr = {
    id: "PR_1",
    repo: "o/r",
    number: 5,
    updatedAt: "2026-01-01T00:00:00Z",
    title: "old",
  } as import("./providers/github/normalize.js").NormalizedPr;
  expect(
    store.save(credentials.id, "prs", [pr], {
      remaining: 1000,
    }),
  ).toBe(true);
  try {
    // A patch from the identity that wrote to GitHub lands.
    await sync.recordMutation(
      credentials.id,
      { kind: "patch", repo: "o/r", number: 5, patch: { title: "new" } },
      { baseUrl: credentials.baseUrl, token: "rotated" },
    );
    expect(sync.listPullRequests(credentials.id, "prs")[0]?.title).toBe("new");
    // A patch from a rotated-away token is dropped.
    await sync.recordMutation(
      credentials.id,
      { kind: "patch", repo: "o/r", number: 5, patch: { title: "stale" } },
      { baseUrl: credentials.baseUrl, token: credentials.token },
    );
    expect(sync.listPullRequests(credentials.id, "prs")[0]?.title).toBe("new");
  } finally {
    await sync.close();
    db.close();
  }
});

afterAll(() => {
  if (old === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = old;
  rmSync(root, { recursive: true, force: true });
});
