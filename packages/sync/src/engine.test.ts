import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, expect, test } from "vitest";
import { createSync } from "./index.js";
import { openCache } from "./cache/open.js";
import { createStore } from "./cache/store.js";

const root = mkdtempSync(join(tmpdir(), "ghd-runtime-"));
const old = process.env.XDG_CACHE_HOME;
beforeEach(() => {
  process.env.XDG_CACHE_HOME = root;
});
const instance = {
  id: "example",
  label: "Example",
  baseUrl: "http://127.0.0.1:1",
  token: "fake",
  username: "tester",
};
test("queue recovers after structural failure, close drains and is terminal", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const sync = createSync({
    loadInstances: async () => {
      calls++;
      if (calls === 1) {
        await gate;
        throw new Error("bad config");
      }
      return [];
    },
  });
  const first = sync.sync();
  const second = sync.sync();
  const closed = sync.close();
  expect(sync.close()).toBe(closed);
  await expect(sync.sync()).rejects.toThrow("closed");
  release();
  await expect(first).rejects.toThrow("bad config");
  expect((await second).results).toEqual([]);
  await closed;
  expect(calls).toBe(2);
});
test("invalid config does not remove cached instances; reads are offline", async () => {
  const sync = createSync({ loadInstances: () => [instance] });
  await sync.sync({ kinds: [] });
  expect(sync.listInstances()).toHaveLength(1);
  expect(sync.listPullRequests("example", "prs")).toEqual([]);
  await sync.close();
  const invalid = createSync({
    loadInstances: () => {
      throw new Error("invalid");
    },
  });
  await expect(invalid.sync()).rejects.toThrow("invalid");
  expect(invalid.listInstances()).toHaveLength(1);
  await invalid.close();
});
test("a rotated token invalidates the old identity even when auth fails", async () => {
  // No configured username: the login comes from authentication.
  const { username: _configured, ...rest } = instance;
  const id = { ...rest, id: "rotating" };
  const first = createSync({
    loadInstances: () => [id],
    authenticate: async () => "old-login",
  });
  await first.sync({ instanceId: "rotating", kinds: [] });
  expect(first.listInstances().find((i) => i.id === "rotating")?.username).toBe(
    "old-login",
  );
  await first.close();
  const failing = async () => {
    throw new Error("bad credentials");
  };
  // Same token, auth down: keep the identity.
  const same = createSync({ loadInstances: () => [id], authenticate: failing });
  await same.sync({ instanceId: "rotating", kinds: [] });
  expect(same.listInstances().find((i) => i.id === "rotating")?.username).toBe(
    "old-login",
  );
  await same.close();
  // Rotated token that fails to authenticate: drop the old identity.
  const rotated = createSync({
    loadInstances: () => [{ ...id, token: "rotated" }],
    authenticate: failing,
  });
  await rotated.sync({ instanceId: "rotating", kinds: [] });
  expect(
    rotated.listInstances().find((i) => i.id === "rotating")?.username,
  ).toBe("");
  await rotated.close();
});
test.each(["rotated", "removed"])(
  "authentication cannot restore an identity %s by another runtime",
  async (change) => {
    const { username: _configured, ...credentials } = instance;
    const target = { ...credentials, id: "pending-auth" };
    const peer = { ...credentials, id: "peer" };
    let configured = [target, peer];
    let started!: () => void;
    const began = new Promise<void>((resolve) => (started = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = createSync({
      loadInstances: () => configured,
      authenticate: async () => {
        started();
        await gate;
        return "old-login";
      },
    });
    const second = createSync({
      loadInstances: () => configured,
      authenticate: async () => "new-login",
    });
    const { db } = openCache();
    const store = createStore(db);
    const pending = first.sync({
      instanceId: target.id,
      kinds: ["notifications"],
    });
    try {
      await began;
      configured = [
        ...(change === "rotated" ? [{ ...target, token: "rotated" }] : []),
        { ...peer, token: "new-peer", label: "New peer" },
      ];
      await second.sync({ kinds: [] });
      const notification = {
        id: "new-notification",
        title: "New identity",
        type: "Issue",
        reason: "mention",
        repo: "o/r",
        url: "https://example.com/o/r/issues/1",
        unread: true,
        updatedAt: "2026-01-01T00:00:00Z",
      };
      for (const i of configured)
        store.save(i.id, "notifications", [notification], {
          etag: '"new"',
          remaining: 1000,
        });
      const identities = second.listInstances();
      release();
      expect((await pending).results[0].fetches).toEqual([
        {
          kind: "notifications",
          status: "skipped",
          count: 0,
          reason: "identity changed during sync",
        },
      ]);
      expect(first.listInstances()).toEqual(identities);
      for (const i of configured) {
        expect(first.listNotifications(i.id)).toEqual([notification]);
        expect(first.getSyncState(i.id, "notifications")?.last_etag).toBe(
          '"new"',
        );
        expect(store.budget(i.id, "rest")?.remaining).toBe(1000);
      }
      if (change === "removed") {
        expect(first.listNotifications(target.id)).toEqual([]);
        expect(first.getSyncState(target.id, "notifications")).toBeUndefined();
      }
    } finally {
      release();
      await pending;
      await first.close();
      await second.close();
      db.close();
    }
  },
);

test("close drains local reconciliation and rejects later local work", async () => {
  let started!: () => void;
  const began = new Promise<void>((resolve) => (started = resolve));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const sync = createSync({
    loadInstances: async () => {
      started();
      await gate;
      return [instance];
    },
  });
  const local = sync.reconcileConfiguration();
  await began;
  const closed = sync.close();
  let didClose = false;
  void closed.then(() => (didClose = true));
  await expect(sync.reconcileConfiguration()).rejects.toThrow("closed");
  expect(didClose).toBe(false);
  release();
  await local;
  await closed;
});

afterAll(() => {
  if (old === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = old;
  rmSync(root, { recursive: true, force: true });
});
