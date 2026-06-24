// Public surface of the sync package. Consumers (the server, the CLI, future
// adopters) should import only from here so the internal layout can change
// without breaking callers.
//
// Typical composition:
//   const { db } = openCache();
//   const repo = createSqliteRepository(db);
//   const engine = createSyncEngine({ repo });
//   await engine.runOnce();
//   engine.start({ intervalMs: 25_000, onCycle: console.log });

// Cache file (raw SQLite open with version check) + path utilities
export {
  type Cache,
  type OpenCacheResult,
  openCache,
  wipeCacheFile,
} from "./cache/open.js";
export { CACHE_SCHEMA_VERSION } from "./cache/schema.js";
export { resolveCachePath } from "./cache/path.js";

// Repository (storage contract + sqlite implementation)
export {
  type InstanceRow,
  type InstanceSummary,
  type NotificationRow,
  type PrKind,
  type PrKindCount,
  type PrRow,
  type Repository,
  type SyncStateRow,
  createSqliteRepository,
} from "./cache/store.js";

// Config (reading ~/.config/github-dashboard/config.yml)
export {
  type GitHubInstance,
  instanceIdFromDomain,
  loadInstances,
  resolveConfigPath,
} from "./config.js";

// Sync engine
export {
  type FetchSummary,
  type InstanceResult,
  type SyncCycleOptions,
  type SyncCycleSummary,
  type SyncEngine,
  type SyncEngineDeps,
  type SyncKind,
  type SyncLoopOptions,
  createSyncEngine,
  printSummary,
  reconcileInstances,
} from "./engine.js";
