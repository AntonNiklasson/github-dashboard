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
