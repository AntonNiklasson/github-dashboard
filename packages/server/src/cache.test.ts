import { afterEach, expect, it, vi } from "vitest";
const fs = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() =>
    JSON.stringify({ "github:prs": { data: [{ number: 1 }] } }),
  ),
}));
vi.mock("node:fs", () => fs);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("never loads the old JSON cache for live data", async () => {
  vi.resetModules();
  vi.stubEnv("DEMO", "0");
  const cache = await import("./cache.js");
  cache.loadCache();
  expect(cache.getCached("github:prs")).toBeNull();
  expect(fs.readFileSync).not.toHaveBeenCalled();
});
it("loads read-only demo fixtures", async () => {
  vi.resetModules();
  vi.stubEnv("DEMO", "1");
  const cache = await import("./cache.js");
  cache.loadCache();
  expect(cache.getCached("github:prs")).toEqual([{ number: 1 }]);
});
