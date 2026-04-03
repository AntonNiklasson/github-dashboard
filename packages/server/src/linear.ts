import { readConfig } from "./config.js";

export interface LinearIssue {
	id: string;
	identifier: string;
	title: string;
	url: string;
	state: {
		name: string;
		color: string;
		type: string;
	};
	priority: number;
	priorityLabel: string;
}

const PRIORITY_LABELS: Record<number, string> = {
	0: "No priority",
	1: "Urgent",
	2: "High",
	3: "Medium",
	4: "Low",
};

/**
 * Extract Linear issue identifiers from a branch name.
 * Linear identifiers follow the pattern: TEAM-123 (e.g., ENG-42, FE-100).
 * Branch names typically look like: `eng-42-my-feature` or `anton/eng-42-fix-bug`.
 */
export function extractLinearIssueIds(branchName: string): string[] {
	const matches = branchName.match(/\b([a-zA-Z]{1,10})-(\d+)\b/g);
	if (!matches) return [];

	// Return uppercased identifiers, deduplicated
	const ids = [...new Set(matches.map((m) => m.toUpperCase()))];
	return ids;
}

export function getLinearToken(): string | null {
	const config = readConfig();
	return config?.linear?.apiKey ?? null;
}

export function isLinearConfigured(): boolean {
	return getLinearToken() !== null;
}

async function linearGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
	const token = getLinearToken();
	if (!token) throw new Error("Linear API key not configured");

	const res = await fetch("https://api.linear.app/graphql", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: token,
		},
		body: JSON.stringify({ query, variables }),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Linear API error: ${res.status} ${text}`);
	}

	const json = await res.json() as { data: T; errors?: { message: string }[] };
	if (json.errors?.length) {
		throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
	}

	return json.data;
}

/**
 * Fetch Linear issues by their identifiers (e.g., ["ENG-42", "FE-100"]).
 * Uses the `issueSearch` query with a filter on identifier.
 */
export async function fetchLinearIssues(identifiers: string[]): Promise<LinearIssue[]> {
	if (identifiers.length === 0) return [];

	// Use issue search with a filter query that matches the identifiers
	const filter = identifiers.map((id) => `identifier:${id}`).join(" OR ");

	const data = await linearGraphQL<{
		issueSearch: {
			nodes: {
				id: string;
				identifier: string;
				title: string;
				url: string;
				state: { name: string; color: string; type: string };
				priority: number;
			}[];
		};
	}>(
		`query($filter: String!) {
			issueSearch(filter: $filter, first: ${identifiers.length}) {
				nodes {
					id
					identifier
					title
					url
					state { name color type }
					priority
				}
			}
		}`,
		{ filter },
	);

	return data.issueSearch.nodes.map((node) => ({
		...node,
		priorityLabel: PRIORITY_LABELS[node.priority] ?? "Unknown",
	}));
}

/**
 * Given a list of branch names, resolve all linked Linear issues.
 * Returns a map of branch name → LinearIssue[].
 */
export async function resolveLinearIssuesForBranches(
	branches: string[],
): Promise<Map<string, LinearIssue[]>> {
	const result = new Map<string, LinearIssue[]>();
	if (!isLinearConfigured()) return result;

	// Collect all identifiers across all branches
	const branchIdentifiers = new Map<string, string[]>();
	const allIdentifiers = new Set<string>();

	for (const branch of branches) {
		const ids = extractLinearIssueIds(branch);
		branchIdentifiers.set(branch, ids);
		for (const id of ids) allIdentifiers.add(id);
	}

	if (allIdentifiers.size === 0) return result;

	try {
		const issues = await fetchLinearIssues([...allIdentifiers]);
		const issueMap = new Map(issues.map((i) => [i.identifier, i]));

		for (const [branch, ids] of branchIdentifiers) {
			const branchIssues = ids
				.map((id) => issueMap.get(id))
				.filter((i): i is LinearIssue => i !== undefined);
			if (branchIssues.length > 0) {
				result.set(branch, branchIssues);
			}
		}
	} catch (err) {
		console.error("Failed to fetch Linear issues:", err instanceof Error ? err.message : err);
	}

	return result;
}
