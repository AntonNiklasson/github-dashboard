import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Octokit } from "@octokit/rest";
import { parse } from "yaml";
import { z } from "zod";

export interface GitHubInstance {
  id: string;
  label: string;
  baseUrl: string;
  token: string;
  username: string;
}

const instanceSchemaZ = z.object({
  domain: z.string().min(1, "domain is required"),
  token: z.string().min(1, "token is required"),
  label: z.string().optional(),
});

const configSchemaZ = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  instances: z.array(instanceSchemaZ).optional(),
});

export type ConfigSchema = z.infer<typeof configSchemaZ>;

// Each error stands alone — we collect every problem we can identify in a
// single pass so the user sees the full picture (e.g. both tokens rejected
// at once rather than one error at a time). `domain` is whatever the user
// typed in config so error messages can refer back to it directly.
export type ConfigError =
  | { kind: "not_found"; path: string }
  | { kind: "parse"; message: string }
  | { kind: "schema"; path: string; message: string }
  | { kind: "missing_tokens" }
  | { kind: "duplicate_domain"; domain: string }
  | { kind: "placeholder_token"; domain: string }
  | { kind: "auth"; domain: string; message: string };

// The literal token from `exampleConfig` — short-circuit auth attempts so a
// freshly-scaffolded file produces a friendlier message than "401 Unauthorized".
const placeholderToken = "ghp_...";

export type ConfigStatus =
  | { kind: "ready"; instances: GitHubInstance[] }
  | { kind: "error"; errors: ConfigError[] };

export const exampleConfig = `theme: system
instances: # one or more
  - domain: github.com
    token: ghp_...
  - domain: ghe.example.com
    label: GHE
    token: ghp_...
`;

export function resolveConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "github-dashboard", "config.yml");
}

export function configExists(): boolean {
  return existsSync(resolveConfigPath());
}

// Permissive read used by hot paths that don't care about diagnostics
// (e.g. getPort). Returns null on any failure.
export function readConfig(): ConfigSchema | null {
  const path = resolveConfigPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = configSchemaZ.safeParse(parse(readFileSync(path, "utf-8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function loadConfigStrict():
  | { ok: true; config: ConfigSchema }
  | { ok: false; errors: ConfigError[] } {
  const path = resolveConfigPath();
  if (!existsSync(path)) {
    return { ok: false, errors: [{ kind: "not_found", path }] };
  }

  let parsed: unknown;
  try {
    parsed = parse(readFileSync(path, "utf-8"));
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          kind: "parse",
          message: err instanceof Error ? err.message : String(err),
        },
      ],
    };
  }

  const result = configSchemaZ.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => ({
        kind: "schema" as const,
        path: i.path.join(".") || "(root)",
        message: i.message,
      })),
    };
  }

  const config = result.data;
  if (!config.instances || config.instances.length === 0) {
    return { ok: false, errors: [{ kind: "missing_tokens" }] };
  }

  return { ok: true, config };
}

// Stable, URL-safe identifier derived from the domain — used in `/api/:instanceId/*`
// routes and as the cache-key prefix. Renaming an instance's label doesn't
// invalidate caches; changing the domain (correctly) does.
export function instanceIdFromDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createConfigFromExample(): {
  created: boolean;
  path: string;
} {
  const path = resolveConfigPath();
  if (existsSync(path)) return { created: false, path };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, exampleConfig, "utf-8");
  return { created: true, path };
}

// Octokit needs the full API base for each instance: github.com lives at
// https://api.github.com (no /api/v3 suffix), while GHES lives at
// https://<host>/api/v3. Accept any of `github.com`, `https://github.com`,
// `ghe.example.com`, `https://ghe.example.com/api/v3`, etc.
function domainToApiBase(domain: string): string {
  const trimmed = domain.trim();
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const host = url.host.toLowerCase();
    if (host === "github.com" || host === "www.github.com") {
      return "https://api.github.com";
    }
    // Reduce to scheme + host (+ port). Any path the user typed is discarded
    // — GHES's API always lives at `/api/v3` on the origin.
    return `${url.origin}/api/v3`;
  } catch {
    // Fall back to the raw input so probeInstance surfaces the parse error.
    return withScheme;
  }
}

export function openInDefaultApp(path: string): void {
  const platform = process.platform;
  const [cmd, args]: [string, string[]] =
    platform === "darwin"
      ? ["open", [path]]
      : platform === "win32"
        ? ["cmd", ["/c", "start", "", path]]
        : ["xdg-open", [path]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

async function probeInstance(
  token: string,
  baseUrl: string,
): Promise<{ ok: true; username: string } | { ok: false; message: string }> {
  try {
    const client = new Octokit({ auth: token, baseUrl });
    const { data } = await client.users.getAuthenticated();
    return { ok: true, username: data.login };
  } catch (err) {
    const e = err as { status?: number; message?: string };
    const message =
      e.status === 401
        ? "Token rejected (401 Unauthorized)"
        : (e.message ?? "Authentication failed");
    return { ok: false, message };
  }
}

async function resolveStatus(): Promise<ConfigStatus> {
  if (process.env.DEMO === "1") {
    return {
      kind: "ready",
      instances: [
        {
          id: "github-com",
          label: "github.com",
          baseUrl: "https://api.github.com",
          token: "",
          username: "octocat",
        },
        {
          id: "ghe-example-com",
          label: "GHE",
          baseUrl: "https://ghe.example.com/api/v3",
          token: "",
          username: "octocat",
        },
      ],
    };
  }

  const loaded = loadConfigStrict();
  if (!loaded.ok) return { kind: "error", errors: loaded.errors };

  const instances: GitHubInstance[] = [];
  const errors: ConfigError[] = [];
  const seenIds = new Set<string>();

  for (const entry of loaded.config.instances ?? []) {
    const id = instanceIdFromDomain(entry.domain);
    if (seenIds.has(id)) {
      errors.push({ kind: "duplicate_domain", domain: entry.domain });
      continue;
    }
    seenIds.add(id);

    if (entry.token === placeholderToken) {
      errors.push({ kind: "placeholder_token", domain: entry.domain });
      continue;
    }

    const baseUrl = domainToApiBase(entry.domain);
    const res = await probeInstance(entry.token, baseUrl);
    if (res.ok) {
      instances.push({
        id,
        label: entry.label || entry.domain,
        baseUrl,
        token: entry.token,
        username: res.username,
      });
    } else {
      errors.push({ kind: "auth", domain: entry.domain, message: res.message });
    }
  }

  return errors.length > 0
    ? { kind: "error", errors }
    : { kind: "ready", instances };
}

let cachedStatus: ConfigStatus | null = null;
let inFlight: Promise<ConfigStatus> | null = null;

export function invalidateConfigStatus(): void {
  cachedStatus = null;
  inFlight = null;
}

export async function getConfigStatus(): Promise<ConfigStatus> {
  if (cachedStatus) return cachedStatus;
  if (inFlight) return inFlight;
  inFlight = resolveStatus().then((status) => {
    cachedStatus = status;
    inFlight = null;
    return status;
  });
  return inFlight;
}

export async function getInstances(): Promise<GitHubInstance[]> {
  const status = await getConfigStatus();
  return status.kind === "ready" ? status.instances : [];
}

export function getPort(): number {
  if (process.env.PORT) return Number(process.env.PORT);
  return 7100;
}
