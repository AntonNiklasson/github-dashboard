# Agent notes

Monorepo: `packages/server` (Hono API, port 7100) + `packages/web` (Vite/React, port 7200, proxies `/api` to server).

## Validating your own work

Close the loop before declaring done. Available tools:

- `pnpm typecheck` — TS across both packages
- `pnpm test` — vitest in both packages
- `pnpm lint` — oxlint
- `pnpm fmt:check` — oxfmt
- `pnpm dev` — runs server + web concurrently (long-running; start in background). Stdout/stderr is tee'd to `.logs/server.log` and `.logs/web.log` — tail or read these to inspect output. Logs reset on each start; accumulate across hot reloads within a session.

For UI/UX changes, type-checks aren't enough — drive the app via the **Playwright MCP** (`.mcp.json`):

- `browser_navigate` to `http://localhost:7200`
- `browser_snapshot` for the accessibility tree (preferred over screenshots for assertions)
- `browser_click`, `browser_type`, `browser_press_key` to exercise keyboard shortcuts
- `browser_console_messages` to catch runtime errors
- `browser_network_requests` to verify `/api/*` calls
- `browser_take_screenshot` only when visual confirmation is needed

Typical loop: edit → dev server hot-reloads → snapshot/interact → check console + `.logs/*` → iterate.

A `config.yaml` with valid tokens already exists locally; don't overwrite it.
