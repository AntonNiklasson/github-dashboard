import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { openCache } from "./open.js";
import { createStore } from "./store.js";

test("snapshot and state commit atomically; identity reset and cascade", () => {
  const dir = mkdtempSync(join(tmpdir(), "ghd-store-"));
  const old = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = dir;
  const { db } = openCache();
  try {
    const store = createStore(db);
    const row = {
      id: "x",
      label: "X",
      baseUrl: "https://api.github.com",
      username: "user",
      credentialKey: "one",
    };
    store.reconcile([row]);
    const item = {
      id: "n",
      title: "title",
      type: "Issue",
      reason: "mention",
      repo: "o/r",
      url: "https://github.com/o/r/issues/1",
      unread: true,
      updatedAt: "2026-01-01",
    };
    store.save("x", "notifications", [item], { etag: '"v1"', remaining: 400 });
    expect(() =>
      store.save("x", "notifications", [{ ...item, id: null }] as never, {
        etag: '"v2"',
      }),
    ).toThrow();
    expect(store.listNotifications("x")).toEqual([item]);
    expect(store.state("x", "notifications")?.last_etag).toBe('"v1"');
    store.save("x", "notifications", null, {});
    expect(store.listNotifications("x")).toEqual([item]);
    store.reconcile([{ ...row, credentialKey: "two" }]);
    expect(store.listNotifications("x")).toEqual([]);
    expect(store.state("x", "notifications")).toBeUndefined();
    store.reconcile([]);
    expect(store.listInstances()).toEqual([]);
  } finally {
    db.close();
    if (old === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = old;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mutation guards survive reopen, protect all list writes, merge patches and expire", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ghd-mutations-"));
  const old = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = dir;
  let { db } = openCache();
  try {
    let store = createStore(db);
    const instance = {
      id: "x",
      label: "X",
      baseUrl: "https://api.github.com",
      credentialKey: "one",
    };
    store.reconcile([instance]);
    const pr = {
      id: "PR_x",
      repo: "o/r",
      number: 5,
      updatedAt: "2026-01-01T00:00:00Z",
      title: "old",
      draft: true,
    } as import("../providers/github/normalize.js").NormalizedPr;
    const notification = {
      id: "42",
      title: "Mention",
      type: "Issue",
      reason: "mention",
      repo: "o/r",
      url: "https://github.com/o/r/issues/5",
      unread: true,
      updatedAt: pr.updatedAt,
    };
    for (const kind of ["prs", "reviews"] as const)
      store.save("x", kind, [pr], {});
    store.save("x", "notifications", [notification], { etag: '"old"' });
    store.recordMutation("x", {
      kind: "patch",
      repo: "o/r",
      number: 5,
      patch: { draft: false },
    });
    store.recordMutation("x", {
      kind: "patch",
      repo: "o/r",
      number: 5,
      patch: { title: "new" },
    });
    store.recordMutation("x", { kind: "notificationDone", id: "42" });
    expect(store.state("x", "notifications")?.last_etag).toBeNull();
    db.close();
    ({ db } = openCache());
    store = createStore(db);
    for (const kind of ["prs", "reviews"] as const) {
      expect(store.listPullRequests("x", kind)[0]).toMatchObject({
        title: "new",
        draft: false,
      });
      store.save("x", kind, [pr], {});
      expect(store.listPullRequests("x", kind)[0]).toMatchObject({
        title: "new",
        draft: false,
      });
    }
    store.save("x", "notifications", [notification], { etag: '"revived"' });
    expect(store.listNotifications("x")).toEqual([]);
    expect(store.state("x", "notifications")?.last_etag).toBeNull();
    store.recordMutation("x", { kind: "removed", repo: "o/r", number: 5 });
    store.save("x", "prs", [pr], {});
    expect(store.listPullRequests("x", "prs")).toEqual([]);
    // Expiry lets authoritative upstream state/new notification activity return.
    db.prepare("UPDATE mutation_guards SET expires_at=0").run();
    store.save("x", "prs", [pr], {});
    store.save("x", "notifications", [notification], {});
    expect(store.listPullRequests("x", "prs")).toEqual([pr]);
    expect(store.listNotifications("x")).toEqual([notification]);
    store.recordMutation("x", { kind: "removed", repo: "o/r", number: 5 });
    store.reconcile([{ ...instance, credentialKey: "rotated" }]);
    expect(
      store.save("x", "prs", [pr], {}, { credentialKey: "one", username: "" }),
    ).toBe(false);
    expect(store.listPullRequests("x", "prs")).toEqual([]);
    store.save("x", "prs", [pr], {});
    expect(store.listPullRequests("x", "prs")).toEqual([pr]);
  } finally {
    db.close();
    if (old === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = old;
    rmSync(dir, { recursive: true, force: true });
  }
});
