# Scenario harness

Run `pnpm scenario` from the repo root. It builds the renderer and prints a local board URL. This is the real Hono API and sync engine, backed by a temporary SQLite database and a loopback GitHub simulator. It does not use the demo-data bypass or read your GitHub credentials.

Enter `queued`, then `queue-failed`, to move the fixture PR into and out of the merge queue. `offline` makes GitHub return 503; `in-flight` restores it. Each command requests a fresh sync through the API. The board polls every 10 seconds; reload it for an immediate update. Use `quit` or Ctrl-C to stop and remove temporary files.

The current board changes its queue icon; the dedicated merge-queue section in #84 is a subsequent product change. This harness supplies the repeatable state transitions for developing it.

`pnpm --filter harness test` checks the simulator through the real engine: transitions, outage, recovery, and persisted snapshots across restart. Unsupported GitHub calls fail with 501 so new engine behavior requires an explicit fixture update.

## Browser feedback loop

Install Chromium once with `pnpm --filter harness exec playwright install chromium`, then run `pnpm test:e2e` from the root. No MCP connection or real GitHub access is required.

The browser check runs the built renderer and real API/engine on disposable ports, then changes the upstream fixture. It verifies SQLite snapshots, normal GUI polling (without reloading), queue entry/exit, failure preservation, recovery, and absence of duplicate PRs. Browser console errors, runtime exceptions, unexpected external requests and unsuccessful API responses fail the check.

Failures retain a Playwright trace and screenshot in `packages/harness/test-results/`. The HTML report includes API responses, upstream requests, and server logs; open it with `pnpm --filter harness exec playwright show-report`. The same check runs in CI and uploads its report on failure.

Additional phases: `conflicts`, `needs-approval`, `changes-requested`, `empty`, `assigned`, `review-requested`, `unassigned`, and `rate-limited` (20-second reset). Assignment-only and review-request-only fixtures are distinct: the current engine still uses review requests; changing the product inbox query belongs to #84. Tests can use `startScenario({ instances: 2 })` and target the second upstream with `setPhase(phase, 1)` / `syncPrs(1)` to check partial outages.

## GitHub access boundary

`pnpm check:boundaries` parses production TypeScript and checks client dependencies. GitHub/network clients and direct server/CLI requests must stay in `packages/sync`; renderer requests are centralized in `api.ts` and use relative `/api/` URLs. Consumers may import only the public `sync` entry point. Electron's loopback readiness probe and port allocation are explicit exceptions; its updater remains separate from dashboard data access. Tests and the simulator may implement an HTTP server. This is a regression guard, not a security sandbox. It runs as part of lint and CI.

## Visual review

Every browser run captures named states (in-flight, queued, queue-failed, outage, recovered, conflicts, approval/review changes, empty lists, partial outage, and rate-limit pause). View PNG attachments in the HTML report, or download the `browser-feedback-loop` Actions artifact, uploaded on successful and failed runs. Screenshots use a pinned viewport, light theme, locale and timezone with animations disabled. These are review artifacts, not pixel-diff assertions; text/structure/state assertions determine correctness.
