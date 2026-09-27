import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, expect, test } from "vitest";
import { createSync } from "./index.js";

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
afterAll(() => {
  if (old === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = old;
  rmSync(root, { recursive: true, force: true });
});
