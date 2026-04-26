import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FsMock } from "./test-utils/fs-mock.js";

vi.mock("node:fs", async () => {
  const { createFsMock } = await import("./test-utils/fs-mock.js");
  return createFsMock();
});

async function freshCache() {
  vi.resetModules();
  return import("./cache.js");
}

async function getFsMock(): Promise<FsMock> {
  return (await import("node:fs")) as unknown as FsMock;
}

beforeEach(async () => {
  (await getFsMock()).__store.clear();
  vi.clearAllMocks();
});

describe("cache in-memory", () => {
  it("returns null for missing key", async () => {
    const { getCached } = await freshCache();
    expect(getCached("missing")).toBeNull();
  });

  it("roundtrips data via set/get", async () => {
    const { getCached, setCached } = await freshCache();
    setCached("k", { a: 1 });
    expect(getCached<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("cacheAge is null when key is missing", async () => {
    const { cacheAge } = await freshCache();
    expect(cacheAge("missing")).toBeNull();
  });

  it("cacheAge is near-zero immediately after setCached", async () => {
    const { setCached, cacheAge } = await freshCache();
    setCached("k", 1);
    const age = cacheAge("k");
    expect(age).not.toBeNull();
    expect(age!).toBeGreaterThanOrEqual(0);
    expect(age!).toBeLessThan(1000);
  });

  it("setCached overwrites prior value", async () => {
    const { setCached, getCached } = await freshCache();
    setCached("k", "first");
    setCached("k", "second");
    expect(getCached("k")).toBe("second");
  });
});

describe("cache persistence", () => {
  it("setCached writes the store to disk as JSON", async () => {
    const { setCached } = await freshCache();
    const fs = await getFsMock();
    setCached("k", { hello: "world" });
    expect(fs.writeFileSync).toHaveBeenCalled();
    const written = fs.writeFileSync.mock.calls.at(-1)![1];
    const parsed = JSON.parse(written);
    expect(parsed.k.data).toEqual({ hello: "world" });
    expect(typeof parsed.k.updatedAt).toBe("string");
  });

  it("loadCache reads prior entries from disk", async () => {
    const fs = await getFsMock();
    // Discover the path cache.ts writes to, then seed it with known content.
    const probe = await freshCache();
    probe.setCached("probe", 0);
    const path = fs.writeFileSync.mock.calls.at(-1)![0];

    fs.__store.clear();
    fs.__store.set(
      path,
      JSON.stringify({
        foo: { data: "bar", updatedAt: new Date().toISOString() },
      }),
    );

    const reloaded = await freshCache();
    reloaded.loadCache();
    expect(reloaded.getCached("foo")).toBe("bar");
  });

  it("loadCache is a no-op when no cache file exists", async () => {
    const fs = await getFsMock();
    const cache = await freshCache();
    expect(() => cache.loadCache()).not.toThrow();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it("loadCache tolerates malformed JSON without throwing", async () => {
    const fs = await getFsMock();
    const probe = await freshCache();
    probe.setCached("probe", 0);
    const path = fs.writeFileSync.mock.calls.at(-1)![0];

    fs.__store.clear();
    fs.__store.set(path, "{ not json");

    const reloaded = await freshCache();
    expect(() => reloaded.loadCache()).not.toThrow();
    expect(reloaded.getCached("anything")).toBeNull();
  });
});

describe("cache in DEMO mode", () => {
  it("setCached skips writing to disk", async () => {
    vi.stubEnv("DEMO", "1");
    const { setCached } = await freshCache();
    const fs = await getFsMock();
    setCached("k", "v");
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
