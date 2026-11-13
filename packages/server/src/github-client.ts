import { Octokit } from "@octokit/rest";
import { type GitHubInstance, getInstances } from "./config.js";

let generation = 0;
const clients = new Map<string, Octokit>();

export async function getClient(instanceId: string): Promise<Octokit> {
  const existing = clients.get(instanceId);
  if (existing) return existing;

  const currentGeneration = generation;
  const instance = await getInstance(instanceId);
  const client = new Octokit({
    auth: instance.token,
    baseUrl: instance.baseUrl,
  });

  if (currentGeneration === generation) clients.set(instanceId, client);
  return client;
}

export async function getInstance(instanceId: string): Promise<GitHubInstance> {
  const instances = await getInstances();
  const instance = instances.find((i) => i.id === instanceId);
  if (!instance) throw new Error(`Unknown instance: ${instanceId}`);
  return instance;
}

export function clearClients(): void {
  generation++;
  clients.clear();
}
