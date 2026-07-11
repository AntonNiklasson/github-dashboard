# Sync service

`sync` exposes a small application API for consumers such as the dashboard
server. Cache files, SQLite rows, repositories, GitHub providers, and engine
construction are private implementation details.

```ts
import { createSyncService, type SyncService } from "sync";

const sync: SyncService = createSyncService({
  onBackgroundError: console.error,
});

await sync.sync({ instanceId: "github-com", kind: "prs" });
const authored = sync.listAuthoredPullRequests("github-com");

sync.start({ intervalMs: 25_000 });
await sync.close();
```

## Contract

- Read methods return normalized domain objects, never database rows.
- `sync` is awaited and reports its cycle result to the caller.
- `requestSync` is fire-and-forget; failures go to `onBackgroundError` and are
  contained by the service.
- `start` and `stop` control the recurring loop.
- `close` waits for the loop and requested syncs, then releases storage. It is
  terminal and idempotent.
- Consumers depend on `SyncService`, so tests can provide an in-memory fake
  without opening SQLite, reading config, starting timers, or calling GitHub.
