import type {
	Instance,
	Notification,
	PR,
	RecentPR,
	ReviewRequest,
	SearchPR,
} from "./types";

async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return res.json();
}

export interface ConfigData {
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

export interface ConfigResponse {
	exists: boolean;
	config?: ConfigData;
}

export class ConfigValidationError extends Error {
	errors: string[];
	constructor(errors: string[]) {
		super(errors.join(", "));
		this.errors = errors;
	}
}

export const api = {
	getConfig: () => fetchJson<ConfigResponse>("/api/config"),
	saveConfig: async (config: ConfigData) => {
		const res = await fetch("/api/config", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(config),
		});
		const body = await res.json();
		if (!res.ok) {
			if (body.errors) throw new ConfigValidationError(body.errors);
			throw new Error(`${res.status} ${res.statusText}`);
		}
		return body;
	},
	instances: () => fetchJson<Instance[]>("/api/instances"),
	prs: (instanceId: string, fresh = false) => fetchJson<PR[]>(`/api/${instanceId}/prs${fresh ? "?fresh=1" : ""}`),
	recentPrs: (instanceId: string, fresh = false) => fetchJson<RecentPR[]>(`/api/${instanceId}/recent-prs${fresh ? "?fresh=1" : ""}`),
	reviews: (instanceId: string, fresh = false) =>
		fetchJson<ReviewRequest[]>(`/api/${instanceId}/reviews${fresh ? "?fresh=1" : ""}`),
	notifications: (instanceId: string, fresh = false) =>
		fetchJson<Notification[]>(`/api/${instanceId}/notifications${fresh ? "?fresh=1" : ""}`),
	searchPrs: (instanceId: string, q: string) =>
		fetchJson<SearchPR[]>(
			`/api/${instanceId}/search/prs?q=${encodeURIComponent(q)}`,
		),
	userPrs: (instanceId: string, username: string) =>
		fetchJson<PR[]>(
			`/api/${instanceId}/users/${encodeURIComponent(username)}/prs`,
		),
	dismissNotification: async (instanceId: string, threadId: string) => {
		const res = await fetch(`/api/${instanceId}/notifications/${threadId}`, {
			method: "DELETE",
		});
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		return res.json();
	},
	toggleDraft: async (instanceId: string, repo: string, prNumber: number) => {
		const [owner, name] = repo.split("/");
		const res = await fetch(
			`/api/${instanceId}/prs/${owner}/${name}/${prNumber}/toggle-draft`,
			{ method: "POST" },
		);
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		return res.json() as Promise<{ ok: boolean; draft: boolean }>;
	},
	prMeta: (instanceId: string, repo: string, prNumber: number) => {
		const [owner, name] = repo.split("/");
		return fetchJson<{
			files: { filename: string; additions: number; deletions: number; status: string; patch: string }[];
			commits: { sha: string; message: string }[];
			checks: { name: string; status: string; conclusion: string | null }[];
		}>(
			`/api/${instanceId}/prs/${owner}/${name}/${prNumber}/meta`,
		);
	},
	toggleAutoMerge: async (instanceId: string, repo: string, prNumber: number) => {
		const [owner, name] = repo.split("/");
		const res = await fetch(
			`/api/${instanceId}/prs/${owner}/${name}/${prNumber}/auto-merge`,
			{ method: "POST" },
		);
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		return res.json() as Promise<{ ok: boolean; autoMerge: boolean }>;
	},
	closePr: async (instanceId: string, repo: string, prNumber: number) => {
		const [owner, name] = repo.split("/");
		const res = await fetch(
			`/api/${instanceId}/prs/${owner}/${name}/${prNumber}/close`,
			{ method: "POST" },
		);
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		return res.json();
	},
	updatePrTitle: async (instanceId: string, repo: string, prNumber: number, title: string) => {
		const [owner, name] = repo.split("/");
		const res = await fetch(
			`/api/${instanceId}/prs/${owner}/${name}/${prNumber}`,
			{ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) },
		);
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		return res.json();
	},
	prComments: (instanceId: string, repo: string, prNumber: number) => {
		const [owner, name] = repo.split("/");
		return fetchJson<{
			id: number;
			author: string;
			body: string;
			createdAt: string;
			path: string | null;
		}[]>(`/api/${instanceId}/prs/${owner}/${name}/${prNumber}/comments`);
	},
	approvePr: async (instanceId: string, repo: string, prNumber: number) => {
		const [owner, name] = repo.split("/");
		const res = await fetch(
			`/api/${instanceId}/prs/${owner}/${name}/${prNumber}/approve`,
			{ method: "POST" },
		);
		if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
		return res.json();
	},
};
