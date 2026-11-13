import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Read-only demo fixtures. Live data is owned exclusively by the sync engine.
const store = new Map<string, { data: unknown }>();
export function loadCache() {
  if (process.env.DEMO !== "1") return;
  const path = resolve(import.meta.dirname, "../../../.cache-demo/data.json");
  try {
    if (existsSync(path)) {
      const entries = JSON.parse(readFileSync(path, "utf-8"));
      for (const [key, entry] of Object.entries(entries)) {
        store.set(key, entry as { data: unknown });
      }
    }
  } catch {
    console.log("Could not load demo fixtures");
  }
}

export function getCached<T>(key: string): T | null {
  return (store.get(key)?.data as T) ?? null;
}
