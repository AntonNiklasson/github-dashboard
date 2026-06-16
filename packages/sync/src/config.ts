import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

export function instanceIdFromDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const instanceSchemaZ = z.object({
  domain: z
    .string()
    .min(1)
    .refine((d) => instanceIdFromDomain(d).length > 0, {
      message: "domain must be a hostname (e.g. github.com)",
    }),
  token: z.string().min(1),
  label: z.string().optional(),
});

const configSchemaZ = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  instances: z.array(instanceSchemaZ).optional(),
});

export function resolveConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "github-dashboard", "config.yml");
}

function domainToApiBase(domain: string): string {
  const trimmed = domain.trim();
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withScheme);
  const host = url.host.toLowerCase();
  if (host === "github.com" || host === "www.github.com") {
    return "https://api.github.com";
  }
  return `${url.origin}/api/v3`;
}

// Resolving a token's username costs one REST call (users.getAuthenticated).
// The engine re-reads config every cycle so reconcile sees added/removed
// instances, but a token's username effectively never changes — caching it by
// (baseUrl, token) keeps loop mode from spending a request per instance per
// cycle, outside the rate-limit floor accounting. Process-lifetime cache; a
// restart re-probes.
const usernameCache = new Map<string, string>();

async function resolveUsername(
  baseUrl: string,
  token: string,
): Promise<string> {
  const key = `${baseUrl} ${token}`;
  const cached = usernameCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const client = new Octokit({ auth: token, baseUrl });
  const { data } = await client.users.getAuthenticated();
  usernameCache.set(key, data.login);

  return data.login;
}

// The yaml parser echoes the offending source line in `err.message`, which
// can include a token if the malformed line is `token: ghp_...`. Strip it
// down to position info only.
function sanitizeYamlError(err: unknown): string {
  const e = err as { linePos?: Array<{ line: number; col: number }> };
  const pos = e.linePos?.[0];
  if (pos) {
    return `YAML parse error at line ${pos.line}, column ${pos.col}`;
  }
  return "Invalid YAML syntax";
}

export async function loadInstances(): Promise<GitHubInstance[]> {
  const path = resolveConfigPath();
  if (!existsSync(path)) {
    throw new Error(`config not found at ${path}`);
  }

  let raw: unknown;
  try {
    raw = parse(readFileSync(path, "utf-8"));
  } catch (err) {
    throw new Error(sanitizeYamlError(err));
  }

  const parsed = configSchemaZ.parse(raw);
  const entries = parsed.instances ?? [];
  if (entries.length === 0) {
    throw new Error(`no instances configured in ${path}`);
  }

  const instances: GitHubInstance[] = [];
  for (const entry of entries) {
    const id = instanceIdFromDomain(entry.domain);
    const baseUrl = domainToApiBase(entry.domain);
    const username = await resolveUsername(baseUrl, entry.token);
    instances.push({
      id,
      label: entry.label || entry.domain,
      baseUrl,
      token: entry.token,
      username,
    });
  }
  return instances;
}
