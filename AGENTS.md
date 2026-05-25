# Agent notes

Monorepo: `packages/server` (Hono API, port 7100) + `packages/web` (Vite/React, port 7200, proxies `/api` to server).

## Validating your own work

Close the loop before declaring done. Available tools:

- `pnpm typecheck` — TS across both packages
- `pnpm test` — vitest in both packages
- `pnpm lint` — oxlint
- `pnpm fmt:check` — oxfmt
- `pnpm dev:web` — runs server + web concurrently (long-running; start in background). For agent work prefer this over `pnpm dev`, which also spawns an Electron window. Stdout/stderr is tee'd to `.logs/server.log` and `.logs/web.log` — tail or read these to inspect output. Logs reset on each start; accumulate across hot reloads within a session.

For UI/UX changes, type-checks aren't enough — drive the app via the **Playwright MCP** (`.mcp.json`):

- `browser_navigate` to `http://localhost:7200`
- `browser_snapshot` for the accessibility tree (preferred over screenshots for assertions)
- `browser_click`, `browser_type`, `browser_press_key` to exercise keyboard shortcuts
- `browser_console_messages` to catch runtime errors
- `browser_network_requests` to verify `/api/*` calls
- `browser_take_screenshot` only when visual confirmation is needed

Typical loop: edit → dev server hot-reloads → snapshot/interact → check console + `.logs/*` → iterate.

A config file with valid tokens already exists at `~/.config/github-dashboard/config.yml`; don't overwrite it.

## Code style

Things `oxfmt`/`oxlint` won't catch but we still care about:

- **Blank lines around React hook calls.** Separate `useEffect`, `useMemo`, `useCallback`, etc. from surrounding code and from each other with a blank line above and below. Multi-statement hook bodies are easier to scan when they aren't visually fused to neighboring lines.
