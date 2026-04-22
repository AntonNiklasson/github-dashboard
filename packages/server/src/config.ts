import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, stringify } from "yaml";
import { Octokit } from "@octokit/rest";

export interface GitHubInstance {
	id: string;
	label: string;
	baseUrl: string;
	token: string;
	username: string;
}

export interface ConfigSchema {
	github?: {
		token: string;
	};
	enterprise?: {
		label: string;
		baseUrl: string;
		token: string;
	};
	port?: number;
}

export const CONFIG_PATH = resolve(import.meta.dirname, "../../../config.yaml");

export function configExists(): boolean {
	return existsSync(CONFIG_PATH);
}

export function readConfig(): ConfigSchema | null {
	if (!configExists()) return null;
	try {
		const raw = readFileSync(CONFIG_PATH, "utf-8");
		return parse(raw) as ConfigSchema;
	} catch {
		return null;
	}
}

export function writeConfig(config: ConfigSchema): void {
	writeFileSync(CONFIG_PATH, stringify(config), "utf-8");
}

// Cached resolved instances (token → username lookup is async)
let cachedInstances: GitHubInstance[] | null = null;

async function fetchUsername(token: string, baseUrl: string): Promise<string> {
	const client = new Octokit({ auth: token, baseUrl });
	const { data } = await client.users.getAuthenticated();
	return data.login;
}

export async function resolveInstances(): Promise<GitHubInstance[]> {
	if (process.env.DEMO === "1") {
		cachedInstances = [
			{
				id: "github",
				label: "github.com",
				baseUrl: "https://api.github.com",
				token: "",
				username: "octocat",
			},
			{
				id: "ghe",
				label: "GHE",
				baseUrl: "https://ghe.example.com/api/v3",
				token: "",
				username: "octocat",
			},
		];
		return cachedInstances;
	}

	const config = readConfig();
	if (!config) {
		cachedInstances = [];
		return [];
	}

	const instances: GitHubInstance[] = [];

	if (config.github?.token) {
		const username = await fetchUsername(config.github.token, "https://api.github.com");
		instances.push({
			id: "github",
			label: "github.com",
			baseUrl: "https://api.github.com",
			token: config.github.token,
			username,
		});
	}

	if (config.enterprise?.token && config.enterprise?.baseUrl) {
		const username = await fetchUsername(config.enterprise.token, config.enterprise.baseUrl);
		instances.push({
			id: "ghe",
			label: config.enterprise.label || "GHE",
			baseUrl: config.enterprise.baseUrl,
			token: config.enterprise.token,
			username,
		});
	}

	cachedInstances = instances;
	return instances;
}

export async function getInstances(): Promise<GitHubInstance[]> {
	if (!cachedInstances) {
		return resolveInstances();
	}
	return cachedInstances;
}

export function getPort(): number {
	if (process.env.PORT) return Number(process.env.PORT);
	const config = readConfig();
	return config?.port ?? 7100;
}
