import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { engine, createSync, getCached } = vi.hoisted(() => {
  const engine = {
    reconcileConfiguration: vi.fn(),
    getSyncState: vi.fn(),
    listInstances: vi.fn(),
    listPullRequests: vi.fn(),
    listNotifications: vi.fn(),
    sync: vi.fn(),
    recordMutation: vi.fn(),
    close: vi.fn(),
  };
  return { engine, createSync: vi.fn(() => engine), getCached: vi.fn() };
});
vi.mock("sync", () => ({ createSync }));
vi.mock("./cache.js", () => ({ getCached }));
let runtime: typeof import("./sync.js");
beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("DEMO", "0");
  createSync.mockReturnValue(engine);
  engine.listInstances.mockReturnValue([{ id: "gh" }]);
  engine.listPullRequests.mockReturnValue([{ id: "node-id", labels: ["bug"] }]);
  engine.listNotifications.mockReturnValue([{ id: "1" }]);
  engine.sync.mockResolvedValue({
    results: [
      { instanceId: "gh", fetches: [{ kind: "prs", status: "updated" }] },
    ],
  });
  runtime = await import("./sync.js");
});
afterEach(async () => {
  await runtime.stopSync();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("uses persisted fresh snapshots; explicit freshness targets just the requested kind", async () => {
  engine.getSyncState.mockReturnValue({
    last_run_at: new Date().toISOString(),
  });
  expect(await runtime.listData("gh", "prs")).toEqual([
    { id: "node-id", labels: ["bug"] },
  ]);
  expect(engine.sync).not.toHaveBeenCalled();
  await runtime.listData("gh", "reviews", true);
  expect(engine.sync).toHaveBeenCalledWith({
    instanceId: "gh",
    kinds: ["reviews"],
  });
  expect(engine.reconcileConfiguration).toHaveBeenCalledTimes(2);
});

it("fetches missing snapshots, but doesn't turn fetch failures or budget skips into empty success", async () => {
  await runtime.listData("gh", "notifications");
  expect(engine.sync).toHaveBeenCalledWith({
    instanceId: "gh",
    kinds: ["notifications"],
  });
  for (const status of ["failed", "skipped"]) {
    engine.sync.mockResolvedValue({
      results: [{ fetches: [{ kind: "prs", status, reason: "unavailable" }] }],
    });
    await expect(runtime.listData("gh", "prs")).rejects.toThrow("unavailable");
  }
});

it("refreshes stale snapshots in background and coalesces identical resyncs", async () => {
  engine.getSyncState.mockReturnValue({ last_run_at: "2020-01-01T00:00:00Z" });
  let release!: () => void;
  engine.sync.mockReturnValue(
    new Promise((resolve) => {
      release = () => resolve({ results: [] });
    }),
  );
  expect(await runtime.listData("gh", "prs")).toHaveLength(1);
  await runtime.listData("gh", "prs");
  expect(engine.sync).toHaveBeenCalledTimes(1);
  release();
  await runtime.waitForPendingResyncs();
});

it("reconciles config before reads, rejecting invalid config and removed instances", async () => {
  engine.reconcileConfiguration.mockRejectedValueOnce(new Error("bad config"));
  await expect(runtime.listData("gh", "prs")).rejects.toThrow("bad config");
  engine.listInstances.mockReturnValue([]);
  await expect(runtime.listData("gh", "prs")).rejects.toThrow(
    "unknown instance",
  );
  expect(engine.listPullRequests).not.toHaveBeenCalled();
  await runtime.reloadSyncConfiguration();
  expect(engine.reconcileConfiguration).toHaveBeenCalledTimes(3);
});

it("demo reads fixtures only, including explicit fresh requests", async () => {
  vi.stubEnv("DEMO", "1");
  getCached.mockReturnValue([{ id: 1 }]);
  expect(await runtime.listData("gh", "prs", true)).toEqual([{ id: 1 }]);
  await runtime.reloadSyncConfiguration();
  runtime.startSync();
  expect(createSync).not.toHaveBeenCalled();
  expect(() => runtime.getSync()).toThrow("demo mode");
});

it("startup doesn't overlap cycles; shutdown drains pending work and closes the engine", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  engine.sync.mockReturnValue(
    new Promise((resolve) => {
      release = () => resolve({ results: [] });
    }),
  );
  runtime.startSync();
  runtime.startSync();
  await vi.advanceTimersByTimeAsync(90_000);
  expect(engine.sync).toHaveBeenCalledTimes(1);
  const closing = runtime.stopSync();
  expect(engine.close).not.toHaveBeenCalled();
  release();
  await closing;
  expect(engine.close).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(engine.sync).toHaveBeenCalledTimes(1);
  expect(() => runtime.getSync()).toThrow("closed");
});
