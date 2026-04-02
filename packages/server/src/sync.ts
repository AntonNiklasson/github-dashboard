import { setCached } from "./cache.js";
import { getInstances } from "./config.js";
import { fetchNotifications, fetchPrs, fetchRecentPrs, fetchReviews } from "./fetchers.js";

const SYNC_INTERVAL = 30_000; // 30s

async function syncInstance(instanceId: string) {
	const tasks = [
		{ key: `${instanceId}:prs`, fn: () => fetchPrs(instanceId) },
		{ key: `${instanceId}:recent-prs`, fn: () => fetchRecentPrs(instanceId) },
		{ key: `${instanceId}:reviews`, fn: () => fetchReviews(instanceId) },
		{ key: `${instanceId}:notifications`, fn: () => fetchNotifications(instanceId) },
	];

	for (const task of tasks) {
		try {
			const data = await task.fn();
			setCached(task.key, data);
		} catch (err) {
			console.error(`Sync failed for ${task.key}:`, err instanceof Error ? err.message : err);
		}
	}
}

async function syncAll() {
	const instances = await getInstances();
	if (instances.length === 0) {
		console.log("No instances configured, skipping sync");
		return;
	}
	console.log(`Syncing ${instances.length} instance(s)...`);
	await Promise.all(instances.map((inst) => syncInstance(inst.id)));
	console.log("Sync complete");
}

export function startSync() {
	// Initial sync immediately
	syncAll();
	// Then repeat
	setInterval(syncAll, SYNC_INTERVAL);
}
