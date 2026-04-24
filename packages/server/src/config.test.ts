import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FsMock } from "./test-utils/fs-mock.js";

vi.mock("node:fs", async () => {
  const { createFsMock } = await import("./test-utils/fs-mock.js");
  return createFsMock();
});

vi.mock("@octokit/rest", async () => {
  const { octokitStub } = await import("./test-utils/octokit-mock.js");
  return { Octokit: octokitStub({ login: "alice" }) };
});

async function freshConfig() {
  vi.resetModules();
  return import("./config.js");
}

async function fsMock(): Promise<FsMock> {
  return (await import("node:fs")) as unknown as FsMock;
}

beforeEach(async () => {
  (await fsMock()).__store.clear();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("readConfig", () => {
  it("returns null when no config file exists", async () => {
    const { readConfig } = await freshConfig();
    expect(readConfig()).toBeNull();
  });

  it("parses a valid YAML config", async () => {
    const { readConfig, CONFIG_PATH } = await freshConfig();
    (await fsMock()).__store.set(
      CONFIG_PATH,
      "github:\n  token: ghp_test\nport: 9000\n",
    );
    const config = readConfig();
    expect(config?.github?.token).toBe("ghp_test");
    expect(config?.port).toBe(9000);
  });

  it("returns null on invalid YAML rather than throwing", async () => {
    const { readConfig, CONFIG_PATH } = await freshConfig();
    (await fsMock()).__store.set(
      CONFIG_PATH,
      "github:\n  token: [unterminated",
    );
    expect(readConfig()).toBeNull();
  });
});

describe("getPort", () => {
  it("uses PORT env var when set", async () => {
    vi.stubEnv("PORT", "9999");
    const { getPort } = await freshConfig();
    expect(getPort()).toBe(9999);
  });

  it("falls back to config.port when env missing", async () => {
    const { getPort, CONFIG_PATH } = await freshConfig();
    (await fsMock()).__store.set(CONFIG_PATH, "port: 8000\n");
    expect(getPort()).toBe(8000);
  });

  it("defaults to 7100 when no config and no env", async () => {
    const { getPort } = await freshConfig();
    expect(getPort()).toBe(7100);
  });
});

describe("resolveInstances", () => {
  it("returns hardcoded fixtures in DEMO mode", async () => {
    vi.stubEnv("DEMO", "1");
    const { resolveInstances } = await freshConfig();
    const instances = await resolveInstances();
    expect(instances.map((i) => i.id)).toEqual(["github", "ghe"]);
    expect(instances[0].username).toBe("octocat");
  });

  it("returns empty list when no config", async () => {
    const { resolveInstances } = await freshConfig();
    expect(await resolveInstances()).toEqual([]);
  });

  it("resolves github.com instance from config", async () => {
    const { resolveInstances, CONFIG_PATH } = await freshConfig();
    (await fsMock()).__store.set(CONFIG_PATH, "github:\n  token: ghp_test\n");
    const instances = await resolveInstances();
    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({
      id: "github",
      label: "github.com",
      token: "ghp_test",
      username: "alice",
    });
  });

  it("resolves enterprise instance with custom label + baseUrl", async () => {
    const { resolveInstances, CONFIG_PATH } = await freshConfig();
    (await fsMock()).__store.set(
      CONFIG_PATH,
      "enterprise:\n  label: Work\n  baseUrl: https://ghe.example.com/api/v3\n  token: ghe_test\n",
    );
    const instances = await resolveInstances();
    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({
      id: "ghe",
      label: "Work",
      baseUrl: "https://ghe.example.com/api/v3",
      token: "ghe_test",
    });
  });

  it("falls back to label 'GHE' when not set", async () => {
    const { resolveInstances, CONFIG_PATH } = await freshConfig();
    (await fsMock()).__store.set(
      CONFIG_PATH,
      "enterprise:\n  baseUrl: https://ghe.example.com/api/v3\n  token: ghe_test\n",
    );
    const instances = await resolveInstances();
    expect(instances[0].label).toBe("GHE");
  });

  it("skips enterprise when baseUrl missing", async () => {
    const { resolveInstances, CONFIG_PATH } = await freshConfig();
    (await fsMock()).__store.set(
      CONFIG_PATH,
      "enterprise:\n  token: ghe_test\n",
    );
    const instances = await resolveInstances();
    expect(instances).toEqual([]);
  });

  it("resolves both instances when both configured", async () => {
    const { resolveInstances, CONFIG_PATH } = await freshConfig();
    (await fsMock()).__store.set(
      CONFIG_PATH,
      "github:\n  token: ghp_test\nenterprise:\n  baseUrl: https://ghe.example.com/api/v3\n  token: ghe_test\n",
    );
    const instances = await resolveInstances();
    expect(instances.map((i) => i.id)).toEqual(["github", "ghe"]);
  });
});

describe("getInstances caching", () => {
  it("memoizes after the first resolve", async () => {
    const { getInstances, resolveInstances, CONFIG_PATH } = await freshConfig();
    (await fsMock()).__store.set(CONFIG_PATH, "github:\n  token: ghp_test\n");

    await resolveInstances();
    // Remove the config — cached value should still return
    (await fsMock()).__store.clear();

    const again = await getInstances();
    expect(again).toHaveLength(1);
    expect(again[0].token).toBe("ghp_test");
  });
});
