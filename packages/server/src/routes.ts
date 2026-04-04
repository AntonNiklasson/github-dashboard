import { Hono } from "hono";
import { Octokit } from "@octokit/rest";
import { getCached, setCached } from "./cache.js";
import { type ConfigSchema, configExists, getInstances, readConfig, resolveInstances, writeConfig } from "./config.js";
import { fetchNotifications, fetchPrs, fetchRecentPrs, fetchReviews } from "./fetchers.js";
import { clearClients, getClient, getInstance } from "./github-client.js";
import { extractLinearIssueIds, fetchLinearIssues, isLinearConfigured } from "./linear.js";

const api = new Hono();

/** Return cached data if available, otherwise fetch live and cache */
async function cachedOrFetch<T>(key: string, fetcher: () => Promise<T>, fresh = false): Promise<T> {
	if (!fresh) {
		const cached = getCached<T>(key);
		if (cached) return cached;
	}
	const data = await fetcher();
	setCached(key, data);
	return data;
}

function maskToken(token: string): string {
	if (token.length <= 4) return "****";
	return "****" + token.slice(-4);
}

// Config endpoints
api.get("/config", (c) => {
	if (!configExists()) {
		return c.json({ exists: false });
	}
	const config = readConfig();
	if (!config) return c.json({ exists: false });

	const masked: ConfigSchema = { ...config };
	if (masked.github?.token) {
		masked.github = { ...masked.github, token: maskToken(masked.github.token) };
	}
	if (masked.enterprise?.token) {
		masked.enterprise = { ...masked.enterprise, token: maskToken(masked.enterprise.token) };
	}
	if (masked.linear?.apiKey) {
		masked.linear = { ...masked.linear, apiKey: maskToken(masked.linear.apiKey) };
	}
	return c.json({ exists: true, config: masked });
});

api.put("/config", async (c) => {
	const incoming = await c.req.json<ConfigSchema>();
	const existing = readConfig();

	// Empty token string means keep existing
	if (incoming.github && incoming.github.token === "" && existing?.github?.token) {
		incoming.github.token = existing.github.token;
	}
	if (incoming.enterprise && incoming.enterprise.token === "" && existing?.enterprise?.token) {
		incoming.enterprise.token = existing.enterprise.token;
	}
	if (incoming.linear && incoming.linear.apiKey === "" && existing?.linear?.apiKey) {
		incoming.linear.apiKey = existing.linear.apiKey;
	}

	// Validate tokens before saving
	const errors: string[] = [];

	if (incoming.github?.token) {
		try {
			const client = new Octokit({ auth: incoming.github.token, baseUrl: "https://api.github.com" });
			await client.users.getAuthenticated();
		} catch {
			errors.push("GitHub.com token is invalid");
		}
	}

	if (incoming.enterprise?.token && incoming.enterprise?.baseUrl) {
		try {
			const client = new Octokit({ auth: incoming.enterprise.token, baseUrl: incoming.enterprise.baseUrl });
			await client.users.getAuthenticated();
		} catch {
			errors.push("GitHub Enterprise token is invalid");
		}
	}

	if (errors.length > 0) {
		return c.json({ ok: false, errors }, 422);
	}

	writeConfig(incoming);
	clearClients();

	// Re-resolve usernames from new tokens
	const instances = await resolveInstances();

	// Clear all cached data so next sync/request fetches fresh
	for (const inst of instances) {
		setCached(`${inst.id}:prs`, null);
		setCached(`${inst.id}:reviews`, null);
		setCached(`${inst.id}:notifications`, null);
	}

	return c.json({ ok: true });
});

// List configured instances (no tokens)
api.get("/instances", async (c) => {
	const instances = await getInstances();
	return c.json(
		instances.map((i) => ({ id: i.id, label: i.label, username: i.username })),
	);
});

// Authored PRs with CI + review status
api.get("/:instanceId/prs", async (c) => {
	const { instanceId } = c.req.param();
	const fresh = c.req.query("fresh") === "1";
	const data = await cachedOrFetch(`${instanceId}:prs`, () => fetchPrs(instanceId), fresh);
	return c.json(data);
});

// Recently closed/merged PRs (today)
api.get("/:instanceId/recent-prs", async (c) => {
	const { instanceId } = c.req.param();
	const fresh = c.req.query("fresh") === "1";
	const data = await cachedOrFetch(`${instanceId}:recent-prs`, () => fetchRecentPrs(instanceId), fresh);
	return c.json(data);
});

// PRs awaiting my review
api.get("/:instanceId/reviews", async (c) => {
	const { instanceId } = c.req.param();
	const fresh = c.req.query("fresh") === "1";
	const data = await cachedOrFetch(`${instanceId}:reviews`, () => fetchReviews(instanceId), fresh);
	return c.json(data);
});

// Notifications (participating)
api.get("/:instanceId/notifications", async (c) => {
	const { instanceId } = c.req.param();
	const fresh = c.req.query("fresh") === "1";
	const data = await cachedOrFetch(`${instanceId}:notifications`, () => fetchNotifications(instanceId), fresh);
	return c.json(data);
});

// Mark notification as done
api.delete("/:instanceId/notifications/:threadId", async (c) => {
	const { instanceId, threadId } = c.req.param();
	const client = await getClient(instanceId);

	await client.activity.markThreadAsDone({ thread_id: Number(threadId) });

	// Optimistically remove from cache so it disappears immediately
	const cached = getCached<{ id: string }[]>(`${instanceId}:notifications`);
	if (cached) {
		setCached(`${instanceId}:notifications`, cached.filter((n) => n.id !== threadId));
	}

	return c.json({ ok: true });
});

// Approve a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/approve", async (c) => {
	const { instanceId, owner, repo, prNumber } = c.req.param();
	const client = await getClient(instanceId);

	await client.pulls.createReview({
		owner,
		repo,
		pull_number: Number(prNumber),
		event: "APPROVE",
	});

	// Invalidate caches so next request fetches fresh
	setCached(`${instanceId}:prs`, null);
	setCached(`${instanceId}:reviews`, null);

	return c.json({ ok: true });
});

// Toggle auto-merge on a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/auto-merge", async (c) => {
	const { instanceId, owner, repo, prNumber } = c.req.param();
	const client = await getClient(instanceId);
	const num = Number(prNumber);

	const { data: pr } = await client.pulls.get({ owner, repo, pull_number: num });

	if (pr.auto_merge) {
		// Disable auto-merge via GraphQL
		await client.graphql(
			`mutation($id: ID!) { disableAutoMerge(input: { pullRequestId: $id }) { pullRequest { id } } }`,
			{ id: pr.node_id },
		);
	} else {
		// Enable auto-merge via GraphQL (merge method: squash by default)
		await client.graphql(
			`mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { pullRequest { id } } }`,
			{ id: pr.node_id },
		);
	}

	setCached(`${instanceId}:prs`, null);

	return c.json({ ok: true, autoMerge: !pr.auto_merge });
});

// Close a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/close", async (c) => {
	const { instanceId, owner, repo, prNumber } = c.req.param();
	const client = await getClient(instanceId);

	await client.pulls.update({
		owner,
		repo,
		pull_number: Number(prNumber),
		state: "closed",
	});

	setCached(`${instanceId}:prs`, null);
	setCached(`${instanceId}:reviews`, null);

	return c.json({ ok: true });
});

// Update PR title
api.patch("/:instanceId/prs/:owner/:repo/:prNumber", async (c) => {
	const { instanceId, owner, repo, prNumber } = c.req.param();
	const { title } = await c.req.json().catch(() => ({ title: null }));
	
	if (!title) {
		return c.json({ error: "Title is required" }, 400);
	}

	const client = await getClient(instanceId);

	await client.pulls.update({
		owner,
		repo,
		pull_number: Number(prNumber),
		title,
	});

	setCached(`${instanceId}:prs`, null);

	return c.json({ ok: true, title });
});

// Toggle draft status on a PR
api.post("/:instanceId/prs/:owner/:repo/:prNumber/toggle-draft", async (c) => {
	const { instanceId, owner, repo, prNumber } = c.req.param();
	const client = await getClient(instanceId);
	const num = Number(prNumber);

	const { data: pr } = await client.pulls.get({ owner, repo, pull_number: num });

	// The REST API doesn't support toggling draft, so use GraphQL
	const mutation = pr.draft
		? `mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`
		: `mutation($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`;

	await client.graphql(mutation, { id: pr.node_id });

	setCached(`${instanceId}:prs`, null);

	return c.json({ ok: true, draft: !pr.draft });
});

// PR metadata for panel + copy menu
api.get("/:instanceId/prs/:owner/:repo/:prNumber/meta", async (c) => {
	const { instanceId, owner, repo, prNumber } = c.req.param();
	const client = await getClient(instanceId);
	const num = Number(prNumber);

	const [filesRes, commitsRes, checksRes, statusesRes] = await Promise.all([
		client.pulls.listFiles({ owner, repo, pull_number: num, per_page: 100 }),
		client.pulls.listCommits({ owner, repo, pull_number: num, per_page: 100 }),
		client.checks
			.listForRef({ owner, repo, ref: `pull/${num}/head`, per_page: 100 })
			.catch(() => null),
		client.repos
			.getCombinedStatusForRef({ owner, repo, ref: `pull/${num}/head` })
			.catch(() => null),
	]);

	const checksByName = new Map<string, { name: string; status: string; conclusion: string | null }>();

	for (const s of statusesRes?.data.statuses ?? []) {
		checksByName.set(s.context, {
			name: s.context,
			status: "completed",
			conclusion: s.state === "success" ? "success" : s.state === "failure" || s.state === "error" ? "failure" : null,
		});
	}

	for (const cr of checksRes?.data.check_runs ?? []) {
		checksByName.set(cr.name, {
			name: cr.name,
			status: cr.status,
			conclusion: cr.conclusion,
		});
	}

	return c.json({
		files: filesRes.data.map((f) => ({
			filename: f.filename,
			additions: f.additions,
			deletions: f.deletions,
			status: f.status,
			patch: f.patch ?? "",
		})),
		commits: commitsRes.data.map((c) => ({
			sha: c.sha.slice(0, 7),
			message: c.commit.message.split("\n")[0],
		})),
		checks: [...checksByName.values()],
	});
});

// PR comments
api.get("/:instanceId/prs/:owner/:repo/:prNumber/comments", async (c) => {
	const { instanceId, owner, repo, prNumber } = c.req.param();
	const client = await getClient(instanceId);
	const num = Number(prNumber);

	const [issueComments, reviewComments] = await Promise.all([
		client.issues.listComments({ owner, repo, issue_number: num, per_page: 100 }),
		client.pulls.listReviewComments({ owner, repo, pull_number: num, per_page: 100 }),
	]);

	const comments = [
		...issueComments.data.map((c) => ({
			id: c.id,
			author: c.user?.login ?? "unknown",
			body: c.body ?? "",
			createdAt: c.created_at,
			path: null as string | null,
		})),
		...reviewComments.data.map((c) => ({
			id: c.id,
			author: c.user?.login ?? "unknown",
			body: c.body,
			createdAt: c.created_at,
			path: c.path,
		})),
	].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

	return c.json(comments);
});

// Search own closed PR history
api.get("/:instanceId/search/prs", async (c) => {
	const { instanceId } = c.req.param();
	const client = await getClient(instanceId);
	const { username } = await getInstance(instanceId);
	const q = c.req.query("q") ?? "";

	const { data } = await client.search.issuesAndPullRequests({
		q: `author:${username} type:pr state:closed ${q}`,
		sort: "updated",
		order: "desc",
		per_page: 20,
	});

	const prs = data.items.map((item) => {
		const [owner, repo] = item.repository_url.split("/").slice(-2);
		return {
			id: item.id,
			number: item.number,
			title: item.title,
			url: item.html_url,
			repo: `${owner}/${repo}`,
			updatedAt: item.updated_at,
			state: item.state,
		};
	});

	return c.json(prs);
});

// Colleague's open PRs
api.get("/:instanceId/users/:username/prs", async (c) => {
	const { instanceId, username } = c.req.param();
	const client = await getClient(instanceId);

	const { data } = await client.search.issuesAndPullRequests({
		q: `author:${username} type:pr state:open`,
		sort: "updated",
		order: "desc",
		per_page: 20,
	});

	const prs = data.items.map((item) => {
		const [owner, repo] = (item.repository_url ?? "").split("/").slice(-2);
		return {
			id: item.id,
			number: item.number,
			title: item.title ?? "",
			body: item.body ?? "",
			url: item.html_url ?? "",
			repo: `${owner}/${repo}`,
			updatedAt: item.updated_at ?? new Date().toISOString(),
			author: item.user?.login ?? "unknown",
			authorAvatar: item.user?.avatar_url ?? "",
			draft: (item as unknown as { draft?: boolean }).draft ?? false,
			ciStatus: "unknown",
			inMergeQueue: false,
			autoMerge: false,
			headBranch: (item as unknown as { head?: { ref?: string } }).head?.ref ?? "",
			baseBranch: (item as unknown as { base?: { ref?: string } }).base?.ref ?? "",
			reviews: { approved: [], changesRequested: [] },
			additions: 0,
			deletions: 0,
			commits: 0,
			commentCount: 0,
			labels: [],
		};
	});

	return c.json(prs);
});

// Linear integration
api.get("/linear/status", (c) => {
	return c.json({ configured: isLinearConfigured() });
});

api.post("/linear/issues", async (c) => {
	if (!isLinearConfigured()) {
		return c.json({ issues: {} });
	}

	const body = await c.req.json<{
		branches?: string[];
		prs?: { key: string; branch?: string; title?: string }[];
	}>();

	// Support both the old `branches` format and the new `prs` format
	const entries: { key: string; sources: string[] }[] = [];

	if (body.prs?.length) {
		for (const pr of body.prs) {
			const sources: string[] = [];
			if (pr.branch) sources.push(pr.branch);
			if (pr.title) sources.push(pr.title);
			if (sources.length > 0) entries.push({ key: pr.key, sources });
		}
	} else if (body.branches?.length) {
		for (const branch of body.branches) {
			entries.push({ key: branch, sources: [branch] });
		}
	}

	if (entries.length === 0) {
		return c.json({ issues: {} });
	}

	// Extract all unique identifiers from all sources
	const allIdentifiers = new Set<string>();
	const entryIdentifiers = new Map<string, string[]>();

	for (const entry of entries) {
		const ids = new Set<string>();
		for (const source of entry.sources) {
			for (const id of extractLinearIssueIds(source)) ids.add(id);
		}
		const idList = [...ids];
		entryIdentifiers.set(entry.key, idList);
		for (const id of idList) allIdentifiers.add(id);
	}

	if (allIdentifiers.size === 0) {
		return c.json({ issues: {} });
	}

	try {
		const issues = await fetchLinearIssues([...allIdentifiers]);
		const issueMap = Object.fromEntries(issues.map((i) => [i.identifier, i]));

		// Build result: key → issues
		const result: Record<string, typeof issues> = {};
		for (const [key, ids] of entryIdentifiers) {
			const matched = ids
				.map((id) => issueMap[id])
				.filter(Boolean);
			if (matched.length > 0) {
				result[key] = matched;
			}
		}

		return c.json({ issues: result });
	} catch (err) {
		console.error("Linear issues fetch failed:", err instanceof Error ? err.message : err);
		return c.json({ issues: {} });
	}
});

export { api };
