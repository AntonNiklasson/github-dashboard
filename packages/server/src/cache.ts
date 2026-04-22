import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DEMO = process.env.DEMO === "1";
const CACHE_DIR = resolve(
	import.meta.dirname,
	DEMO ? "../../../.cache-demo" : "../../../.cache",
);
const CACHE_FILE = resolve(CACHE_DIR, "data.json");

interface CacheEntry {
	data: unknown;
	updatedAt: string;
}

const store = new Map<string, CacheEntry>();

// Load from disk on startup
export function loadCache() {
	try {
		if (existsSync(CACHE_FILE)) {
			const raw = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
			for (const [key, entry] of Object.entries(raw)) {
				store.set(key, entry as CacheEntry);
			}
			console.log(`Cache loaded: ${store.size} entries`);
		}
	} catch {
		console.log("No existing cache found, starting fresh");
	}
}

function persistCache() {
	if (DEMO) return;
	try {
		mkdirSync(CACHE_DIR, { recursive: true });
		const obj: Record<string, CacheEntry> = {};
		for (const [key, entry] of store) {
			obj[key] = entry;
		}
		writeFileSync(CACHE_FILE, JSON.stringify(obj));
	} catch (err) {
		console.error("Failed to persist cache:", err);
	}
}

export function getCached<T>(key: string): T | null {
	const entry = store.get(key);
	if (!entry) return null;
	return entry.data as T;
}

export function setCached(key: string, data: unknown) {
	store.set(key, { data, updatedAt: new Date().toISOString() });
	persistCache();
}

export function cacheAge(key: string): number | null {
	const entry = store.get(key);
	if (!entry) return null;
	return Date.now() - new Date(entry.updatedAt).getTime();
}
