# Scenario harness

Run `pnpm scenario` from the repo root. It builds the renderer and prints a local board URL. This is the real Hono API and sync engine, backed by a temporary SQLite database and a loopback GitHub simulator. It does not use the demo-data bypass or read your GitHub credentials.

Enter `queued`, then `queue-failed`, to move the fixture PR into and out of the merge queue. `offline` makes GitHub return 503; `in-flight` restores it. Each command requests a fresh sync through the API. The board polls every 10 seconds; reload it for an immediate update. Use `quit` or Ctrl-C to stop and remove temporary files.

The current board changes its queue icon; the dedicated merge-queue section in #84 is a subsequent product change. This harness supplies the repeatable state transitions for developing it.

`pnpm --filter harness test` checks the simulator through the real engine: transitions, outage, recovery, and persisted snapshots across restart. Unsupported GitHub calls fail with 501 so new engine behavior requires an explicit fixture update.
