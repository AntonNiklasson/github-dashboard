import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveConfigPath } from "./config.js";

export const SYNC_INTERVAL_PRESETS = [
  30_000, 60_000, 300_000, 1_200_000,
] as const;
export const DEFAULT_SYNC_INTERVAL = 60_000;

interface Settings {
  syncIntervalMs: number;
}

// App-owned preferences live beside, not inside, the user's config.yml.
function settingsPath() {
  return join(dirname(resolveConfigPath()), "settings.json");
}

export function isSyncIntervalPreset(ms: unknown): ms is number {
  return SYNC_INTERVAL_PRESETS.includes(ms as never);
}

export function readSettings(): Settings {
  const path = settingsPath();
  if (!existsSync(path)) return { syncIntervalMs: DEFAULT_SYNC_INTERVAL };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Settings>;
    return {
      syncIntervalMs: isSyncIntervalPreset(raw.syncIntervalMs)
        ? raw.syncIntervalMs
        : DEFAULT_SYNC_INTERVAL,
    };
  } catch {
    return { syncIntervalMs: DEFAULT_SYNC_INTERVAL };
  }
}

export function writeSettings(settings: Settings) {
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}
