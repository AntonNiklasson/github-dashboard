import { beforeEach, describe, expect, it, vi } from "vitest";

const { cacheStore, configStub, syncStub } = vi.hoisted(() => {
  return {
    cacheStore: new Map<string, unknown>(),
    syncStub: {
      listData: vi.fn(),
      getPullRequestDiff: vi.fn(),
      getPullRequestComments: vi.fn(),
      reloadSyncConfiguration: vi.fn().mockResolvedValue(undefined),
      scheduleResync: vi.fn(),
      waitForPendingResyncs: vi.fn(),
      markNotificationDone: vi.fn(),
      approvePullRequest: vi.fn(),
      togglePullRequestAutoMerge: vi.fn(),
      togglePullRequestDraft: vi.fn(),
    },
    configStub: {
      createConfigFromExample: vi.fn(),
      exampleConfig: "port: 7100\n",
      getConfigStatus: vi.fn(),
      invalidateConfigStatus: vi.fn(),
      openInDefaultApp: vi.fn(),
      readConfig: vi.fn<() => Record<string, unknown> | null>(() => null),
      resolveConfigPath: vi.fn(() => "/test/config.yml"),
    },
  };
});

vi.mock("./cache.js", () => ({
  clearCache: () => cacheStore.clear(),
  getCached: (key: string) => cacheStore.get(key) ?? null,
  setCached: (key: string, data: unknown) => {
    cacheStore.set(key, data);
  },
}));

vi.mock("./sync.js", () => ({ ...syncStub, getSync: () => syncStub }));
vi.mock("./config.js", () => configStub);
// Import after mocks are registered
const { api } = await import("./routes.js");
const { waitForPendingResyncs } = await import("./sync.js");

function call(
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
) {
  return api.request(path, {
    method: init?.method,
    headers: { "content-type": "application/json", ...init?.headers },
    body: init?.body == null ? undefined : JSON.stringify(init.body),
  });
}

beforeEach(async () => {
  await waitForPendingResyncs();
  cacheStore.clear();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /config", () => {
  it("returns the resolved status alongside path + example, stripping tokens", async () => {
    configStub.getConfigStatus.mockResolvedValue({
      kind: "ready",
      instances: [
        {
          id: "github",
          label: "gh",
          baseUrl: "https://api.github.com",
          token: "SECRET",
          username: "alice",
        },
      ],
    });
    const res = await call("/config");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      path: "/test/config.yml",
      example: "port: 7100\n",
      theme: "system",
      status: {
        kind: "ready",
        instances: [{ id: "github", label: "gh", username: "alice" }],
      },
    });
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  it("surfaces the user's theme preference from the config file", async () => {
    configStub.readConfig.mockReturnValue({ theme: "dark" });
    configStub.getConfigStatus.mockResolvedValue({
      kind: "ready",
      instances: [],
    });
    const res = await call("/config");
    const body = await res.json();
    expect(body.theme).toBe("dark");
  });

  it("surfaces a list of errors when the config isn't ready", async () => {
    configStub.getConfigStatus.mockResolvedValue({
      kind: "error",
      errors: [
        {
          kind: "auth",
          domain: "github.com",
          message: "Token rejected (401 Unauthorized)",
        },
        {
          kind: "auth",
          domain: "ghe.example.com",
          message: "Token rejected (401 Unauthorized)",
        },
      ],
    });
    const res = await call("/config");
    const body = await res.json();
    expect(body.status.kind).toBe("error");
    expect(body.status.errors).toHaveLength(2);
    expect(body.status.errors[0]).toMatchObject({
      kind: "auth",
      domain: "github.com",
    });
    expect(body.status.errors[1]).toMatchObject({
      kind: "auth",
      domain: "ghe.example.com",
    });
  });
});

describe("POST /config/create", () => {
  it("writes the example file, invalidates the status cache, and opens it", async () => {
    configStub.createConfigFromExample.mockReturnValue({
      created: true,
      path: "/test/config.yml",
    });
    const res = await call("/config/create", { method: "POST" });
    expect(await res.json()).toEqual({
      created: true,
      path: "/test/config.yml",
    });
    expect(configStub.invalidateConfigStatus).toHaveBeenCalled();
    expect(configStub.openInDefaultApp).toHaveBeenCalledWith(
      "/test/config.yml",
    );
  });

  it("does nothing when the file already exists", async () => {
    configStub.createConfigFromExample.mockReturnValue({
      created: false,
      path: "/test/config.yml",
    });
    const res = await call("/config/create", { method: "POST" });
    expect(await res.json()).toEqual({
      created: false,
      path: "/test/config.yml",
    });
    expect(configStub.invalidateConfigStatus).not.toHaveBeenCalled();
    expect(configStub.openInDefaultApp).not.toHaveBeenCalled();
  });
});

describe("POST /config/reload", () => {
  it("invalidates diagnostics and reconciles even when auth fails", async () => {
    configStub.getConfigStatus.mockResolvedValue({
      kind: "error",
      errors: [{ kind: "auth", domain: "github.com", message: "Rejected" }],
    });
    cacheStore.set("github:repo-settings:o/r", { autoMergeAllowed: true });
    const res = await call("/config/reload", { method: "POST" });
    expect(res.status).toBe(200);
    expect(configStub.invalidateConfigStatus).toHaveBeenCalledOnce();
    expect(syncStub.reloadSyncConfiguration).toHaveBeenCalledOnce();
  });
});

for (const kind of ["prs", "reviews", "notifications"]) {
  it(`GET /:instanceId/${kind} uses shared list data and forwards fresh`, async () => {
    const rich = [
      {
        id: "PR_node",
        body: "body",
        labels: ["bug"],
        autoMergeAllowed: true,
        commentCount: 3,
      },
    ];
    syncStub.listData.mockResolvedValue(rich);
    const res = await call(`/github/${kind}?fresh=1`);
    expect(await res.json()).toEqual(rich);
    expect(syncStub.listData).toHaveBeenCalledWith("github", kind, true);
  });
}

it("DELETE notification uses shared action then schedules a refresh", async () => {
  const res = await call("/github/notifications/42", { method: "DELETE" });
  expect(res.status).toBe(200);
  expect(syncStub.markNotificationDone).toHaveBeenCalledWith({
    instanceId: "github",
    id: "42",
  });
  expect(syncStub.scheduleResync).toHaveBeenCalledWith("github", [
    "notifications",
  ]);
});

it("approval uses shared action and refreshes both lists", async () => {
  const res = await call("/github/prs/o/r/5/approve", { method: "POST" });
  expect(res.status).toBe(200);
  expect(syncStub.approvePullRequest).toHaveBeenCalledWith({
    instanceId: "github",
    repo: "o/r",
    number: 5,
  });
  expect(syncStub.scheduleResync).toHaveBeenCalledWith("github", [
    "prs",
    "reviews",
  ]);
});

it("auto-merge preserves action result and the GUI's 422 error contract", async () => {
  syncStub.togglePullRequestAutoMerge.mockResolvedValueOnce({
    autoMerge: true,
  });
  const res = await call("/github/prs/o/r/5/auto-merge", { method: "POST" });
  expect(await res.json()).toEqual({ ok: true, autoMerge: true });
  syncStub.togglePullRequestAutoMerge.mockRejectedValueOnce(
    new Error("auto-merge is not allowed for this repository"),
  );
  const failed = await call("/github/prs/o/r/5/auto-merge", { method: "POST" });
  expect(failed.status).toBe(422);
  expect(await failed.json()).toEqual({ error: "auto_merge_not_allowed" });
});

it("draft toggle returns shared action result and refreshes both lists", async () => {
  syncStub.togglePullRequestDraft.mockResolvedValueOnce({ draft: false });
  const res = await call("/github/prs/o/r/5/toggle-draft", { method: "POST" });
  expect(await res.json()).toEqual({ ok: true, draft: false });
  expect(syncStub.togglePullRequestDraft).toHaveBeenCalledWith({
    instanceId: "github",
    repo: "o/r",
    number: 5,
  });
  expect(syncStub.scheduleResync).toHaveBeenCalledWith("github", [
    "prs",
    "reviews",
  ]);
});

for (const [path, method] of [
  ["diff", "getPullRequestDiff"],
  ["comments", "getPullRequestComments"],
] as const) {
  it(`delegates ${path} to the shared engine`, async () => {
    const result =
      path === "diff"
        ? { headSha: "abc", files: [] }
        : [{ id: 1, body: "hello" }];
    syncStub[method].mockResolvedValue(result);
    const res = await call(`/github/prs/o/r/5/${path}`);
    expect(await res.json()).toEqual(result);
    expect(syncStub[method]).toHaveBeenCalledWith({
      instanceId: "github",
      repo: "o/r",
      number: 5,
    });
  });
}

for (const [method, path] of [
  ["POST", "/github/prs/o/r/5/merge"],
  ["POST", "/github/prs/o/r/5/close"],
  ["PATCH", "/github/prs/o/r/5"],
  ["POST", "/github/prs/o/r/5/rerun-ci"],
  ["POST", "/github/prs/o/r/5/comment"],
  ["GET", "/github/prs/o/r/5/meta"],
  ["GET", "/github/search/prs?q=test"],
  ["GET", "/github/users/alice/prs"],
]) {
  it(`removes unsupported endpoint ${method} ${path}`, async () => {
    expect((await call(path, { method })).status).toBe(404);
  });
}
