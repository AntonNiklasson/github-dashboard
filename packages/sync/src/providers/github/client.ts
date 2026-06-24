import { Octokit } from "@octokit/rest";
import type { GitHubInstance } from "../../config.js";

interface CachedClient {
  client: Octokit;
  token: string;
  baseUrl: string;
}

const clients = new Map<string, CachedClient>();

export function getClient(instance: GitHubInstance): Octokit {
  // Reuse the cached client only while credentials are unchanged. A token
  // rotation or baseUrl switch (e.g. config edit while looping) recreates it,
  // so we never keep authenticating with a stale token until restart.
  const existing = clients.get(instance.id);
  if (
    existing &&
    existing.token === instance.token &&
    existing.baseUrl === instance.baseUrl
  ) {
    return existing.client;
  }
  const client = new Octokit({
    auth: instance.token,
    baseUrl: instance.baseUrl,
  });
  clients.set(instance.id, {
    client,
    token: instance.token,
    baseUrl: instance.baseUrl,
  });
  return client;
}
