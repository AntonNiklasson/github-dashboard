import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FsMock } from "./test-utils/fs-mock.js";

vi.mock("node:fs", async () => {
  const { createFsMock } = await import("./test-utils/fs-mock.js");
  return createFsMock();
});

const octokitHolder = vi.hoisted(
  (): { ctor: new (args?: unknown) => unknown } => ({
    // Filled in after the mock module loads.
    ctor: class {},
  }),
);

vi.mock("@octokit/rest", async () => {
  const { octokitStub } = await import("./test-utils/octokit-mock.js");
  octokitHolder.ctor = octokitStub({ login: "alice" });
  return {
    get Octokit() {
      return octokitHolder.ctor;
    },
  };
});

async function withOctokit<T>(
  ctor: new (args?: unknown) => unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = octokitHolder.ctor;
  octokitHolder.ctor = ctor;
  try {
    return await fn();
  } finally {
    octokitHolder.ctor = previous;
  }
}

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
    const { readConfig, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
      "instances:\n  - domain: github.com\n    token: ghp_test\n",
    );
    const config = readConfig();
    expect(config?.instances?.[0]?.token).toBe("ghp_test");
  });

  it("returns null on invalid YAML rather than throwing", async () => {
    const { readConfig, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
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

  it("defaults to 7100 when no env", async () => {
    const { getPort } = await freshConfig();
    expect(getPort()).toBe(7100);
  });
});

describe("getConfigStatus", () => {
  it("returns demo fixtures in DEMO mode", async () => {
    vi.stubEnv("DEMO", "1");
    const { getConfigStatus } = await freshConfig();
    const status = await getConfigStatus();
    expect(status.kind).toBe("ready");
    if (status.kind === "ready") {
      expect(status.instances.map((i) => i.id)).toEqual([
        "github-com",
        "ghe-example-com",
      ]);
    }
  });

  it("reports not_found when the file is missing", async () => {
    const { getConfigStatus, resolveConfigPath } = await freshConfig();
    const status = await getConfigStatus();
    expect(status).toEqual({
      kind: "error",
      errors: [{ kind: "not_found", path: resolveConfigPath() }],
    });
  });

  it("reports a parse error for malformed YAML", async () => {
    const { getConfigStatus, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
      "github:\n  token: [unterminated",
    );
    const status = await getConfigStatus();
    expect(status.kind).toBe("error");
    if (status.kind === "error") {
      expect(status.errors[0].kind).toBe("parse");
    }
  });

  it("reports schema violations when fields are the wrong type", async () => {
    const { getConfigStatus, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
      "theme: not-a-theme\ninstances:\n  - domain: github.com\n    token: ghp_test\n",
    );
    const status = await getConfigStatus();
    expect(status.kind).toBe("error");
    if (status.kind === "error") {
      expect(status.errors.some((e) => e.kind === "schema")).toBe(true);
    }
  });

  it("reports missing_tokens when the instances list is empty or absent", async () => {
    const { getConfigStatus, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(resolveConfigPath(), "theme: dark\n");
    const status = await getConfigStatus();
    expect(status).toEqual({
      kind: "error",
      errors: [{ kind: "missing_tokens" }],
    });
  });

  it("resolves both instances when both tokens are valid", async () => {
    const { getConfigStatus, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
      "instances:\n  - domain: github.com\n    token: ghp_test\n  - domain: ghe.example.com\n    label: GHE\n    token: ghe_test\n",
    );
    const status = await getConfigStatus();
    expect(status.kind).toBe("ready");
    if (status.kind === "ready") {
      expect(status.instances.map((i) => i.id)).toEqual([
        "github-com",
        "ghe-example-com",
      ]);
      expect(status.instances.find((i) => i.id === "github-com")?.baseUrl).toBe(
        "https://api.github.com",
      );
      expect(
        status.instances.find((i) => i.id === "ghe-example-com")?.baseUrl,
      ).toBe("https://ghe.example.com/api/v3");
    }
  });

  it("falls back to the domain as label when label is omitted", async () => {
    const { getConfigStatus, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
      "instances:\n  - domain: ghe.example.com\n    token: ghe_test\n",
    );
    const status = await getConfigStatus();
    expect(status.kind).toBe("ready");
    if (status.kind === "ready") {
      expect(status.instances[0]?.label).toBe("ghe.example.com");
    }
  });

  it("flags duplicate domains", async () => {
    const { getConfigStatus, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
      "instances:\n  - domain: github.com\n    token: ghp_a\n  - domain: github.com\n    token: ghp_b\n",
    );
    const status = await getConfigStatus();
    expect(status.kind).toBe("error");
    if (status.kind === "error") {
      expect(
        status.errors.some(
          (e) => e.kind === "duplicate_domain" && e.domain === "github.com",
        ),
      ).toBe(true);
    }
  });

  it.each([
    ["github.com", "https://api.github.com"],
    ["https://github.com", "https://api.github.com"],
    ["www.github.com", "https://api.github.com"],
    ["ghe.example.com", "https://ghe.example.com/api/v3"],
    ["https://ghe.example.com", "https://ghe.example.com/api/v3"],
    ["https://ghe.example.com/", "https://ghe.example.com/api/v3"],
    ["https://ghe.example.com/api/v3", "https://ghe.example.com/api/v3"],
    ["http://ghe.example.com", "http://ghe.example.com/api/v3"],
    ["ghe.example.com:8443", "https://ghe.example.com:8443/api/v3"],
    [
      "https://ghe.example.com:8443/api/v3",
      "https://ghe.example.com:8443/api/v3",
    ],
  ])("normalizes domain %s → %s", async (input, expected) => {
    const { getConfigStatus, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
      `instances:\n  - domain: ${input}\n    token: ghe_test\n`,
    );
    const status = await getConfigStatus();
    expect(status.kind).toBe("ready");
    if (status.kind === "ready") {
      expect(status.instances[0]?.baseUrl).toBe(expected);
    }
  });

  it("rejects an invalid theme value as a schema error", async () => {
    const { getConfigStatus, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
      "theme: midnight\ninstances:\n  - domain: github.com\n    token: ghp_test\n",
    );
    const status = await getConfigStatus();
    expect(status.kind).toBe("error");
    if (status.kind === "error") {
      expect(
        status.errors.some((e) => e.kind === "schema" && e.path === "theme"),
      ).toBe(true);
    }
  });

  it("accepts a valid theme value", async () => {
    const { readConfig, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
      "theme: dark\ninstances:\n  - domain: github.com\n    token: ghp_test\n",
    );
    expect(readConfig()?.theme).toBe("dark");
  });

  it("flags placeholder tokens without attempting auth", async () => {
    // If we accidentally hit GitHub here the octokit stub would return alice;
    // the test asserts we get a `placeholder_token` error, proving we never
    // even constructed an Octokit for the placeholder.
    const { getConfigStatus, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
      "instances:\n  - domain: github.com\n    token: ghp_...\n  - domain: ghe.example.com\n    token: ghp_...\n",
    );
    const status = await getConfigStatus();
    expect(status).toEqual({
      kind: "error",
      errors: [
        { kind: "placeholder_token", domain: "github.com" },
        { kind: "placeholder_token", domain: "ghe.example.com" },
      ],
    });
  });

  it("collects auth failures from every rejected token in one pass", async () => {
    const { octokitStub } = await import("./test-utils/octokit-mock.js");
    await withOctokit(
      octokitStub({
        throws: Object.assign(new Error("Bad credentials"), { status: 401 }),
      }),
      async () => {
        const { getConfigStatus, resolveConfigPath } = await freshConfig();
        (await fsMock()).__store.set(
          resolveConfigPath(),
          "instances:\n  - domain: github.com\n    token: ghp_bad\n  - domain: ghe.example.com\n    token: ghe_bad\n",
        );
        const status = await getConfigStatus();
        expect(status.kind).toBe("error");
        if (status.kind === "error") {
          expect(status.errors).toHaveLength(2);
          expect(status.errors).toEqual([
            expect.objectContaining({ kind: "auth", domain: "github.com" }),
            expect.objectContaining({
              kind: "auth",
              domain: "ghe.example.com",
            }),
          ]);
        }
      },
    );
  });

  it("classifies network errors as unreachable, not auth", async () => {
    const { octokitStub } = await import("./test-utils/octokit-mock.js");
    await withOctokit(
      octokitStub({
        throws: Object.assign(
          new Error("getaddrinfo ENOTFOUND ghe.example.com"),
          {
            code: "ENOTFOUND",
          },
        ),
      }),
      async () => {
        const { getConfigStatus, resolveConfigPath } = await freshConfig();
        (await fsMock()).__store.set(
          resolveConfigPath(),
          "instances:\n  - domain: ghe.example.com\n    token: ghe_test\n",
        );
        const status = await getConfigStatus();
        expect(status.kind).toBe("error");
        if (status.kind === "error") {
          expect(status.errors[0]).toMatchObject({
            kind: "unreachable",
            domain: "ghe.example.com",
            message: expect.stringContaining("DNS"),
          });
        }
      },
    );
  });

  it("collapses HTML maintenance-page bodies into a one-line message", async () => {
    const { octokitStub } = await import("./test-utils/octokit-mock.js");
    const htmlBody =
      "<!DOCTYPE html>\n<html><head><title>GitHub Enterprise is currently down for maintenance</title></head><body>" +
      "x".repeat(5000) +
      "</body></html>";
    await withOctokit(
      octokitStub({
        throws: Object.assign(new Error(htmlBody), { status: 503 }),
      }),
      async () => {
        const { getConfigStatus, resolveConfigPath } = await freshConfig();
        (await fsMock()).__store.set(
          resolveConfigPath(),
          "instances:\n  - domain: ghe.example.com\n    token: ghe_test\n",
        );
        const status = await getConfigStatus();
        expect(status.kind).toBe("error");
        if (status.kind === "error") {
          const err = status.errors[0];
          expect(err.kind).toBe("unreachable");
          if (err.kind === "unreachable") {
            expect(err.message.length).toBeLessThan(200);
            expect(err.message).toMatch(/HTML page/);
          }
        }
      },
    );
  });

  it("caps long error messages even when not recognized as HTML or network", async () => {
    const { octokitStub } = await import("./test-utils/octokit-mock.js");
    await withOctokit(
      octokitStub({
        throws: new Error("x".repeat(10000)),
      }),
      async () => {
        const { getConfigStatus, resolveConfigPath } = await freshConfig();
        (await fsMock()).__store.set(
          resolveConfigPath(),
          "instances:\n  - domain: ghe.example.com\n    token: ghe_test\n",
        );
        const status = await getConfigStatus();
        if (status.kind === "error") {
          const err = status.errors[0];
          if (err.kind === "unreachable" || err.kind === "auth") {
            expect(err.message.length).toBeLessThanOrEqual(250);
          }
        }
      },
    );
  });
});

describe("resolveConfigPath", () => {
  it("uses XDG_CONFIG_HOME when set", async () => {
    vi.stubEnv("XDG_CONFIG_HOME", "/xdg");
    const { resolveConfigPath } = await freshConfig();
    expect(resolveConfigPath()).toBe("/xdg/github-dashboard/config.yml");
  });

  it("falls back to $HOME/.config when XDG_CONFIG_HOME is unset", async () => {
    vi.stubEnv("XDG_CONFIG_HOME", "");
    vi.stubEnv("HOME", "/home/test");
    const { resolveConfigPath } = await freshConfig();
    expect(resolveConfigPath()).toBe(
      "/home/test/.config/github-dashboard/config.yml",
    );
  });
});

describe("createConfigFromExample", () => {
  it("writes the example yaml when no file exists", async () => {
    vi.stubEnv("XDG_CONFIG_HOME", "/xdg");
    const { createConfigFromExample, exampleConfig } = await freshConfig();
    const result = createConfigFromExample();
    expect(result).toEqual({
      created: true,
      path: "/xdg/github-dashboard/config.yml",
    });
    const fs = await fsMock();
    expect(fs.mkdirSync).toHaveBeenCalledWith("/xdg/github-dashboard", {
      recursive: true,
    });
    expect(fs.__store.get("/xdg/github-dashboard/config.yml")).toBe(
      exampleConfig,
    );
  });

  it("leaves an existing file untouched", async () => {
    vi.stubEnv("XDG_CONFIG_HOME", "/xdg");
    const { createConfigFromExample } = await freshConfig();
    const fs = await fsMock();
    fs.__store.set("/xdg/github-dashboard/config.yml", "theme: dark\n");
    const result = createConfigFromExample();
    expect(result).toEqual({
      created: false,
      path: "/xdg/github-dashboard/config.yml",
    });
    expect(fs.__store.get("/xdg/github-dashboard/config.yml")).toBe(
      "theme: dark\n",
    );
  });
});

describe("invalidateConfigStatus", () => {
  it("clears the cached status so the next call re-resolves", async () => {
    const { getConfigStatus, invalidateConfigStatus, resolveConfigPath } =
      await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
      "instances:\n  - domain: github.com\n    token: ghp_test\n",
    );
    const first = await getConfigStatus();
    expect(first.kind).toBe("ready");

    // Delete the file and invalidate — next call should reflect missing file
    (await fsMock()).__store.clear();
    invalidateConfigStatus();
    const second = await getConfigStatus();
    expect(second.kind).toBe("error");
    if (second.kind === "error") {
      expect(second.errors[0].kind).toBe("not_found");
    }
  });

  it("memoizes between invalidations", async () => {
    const { getConfigStatus, resolveConfigPath } = await freshConfig();
    (await fsMock()).__store.set(
      resolveConfigPath(),
      "instances:\n  - domain: github.com\n    token: ghp_test\n",
    );
    await getConfigStatus();
    // Wipe the disk — without invalidate, cached result still wins.
    (await fsMock()).__store.clear();
    const again = await getConfigStatus();
    expect(again.kind).toBe("ready");
  });
});
