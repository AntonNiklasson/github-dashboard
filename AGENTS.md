# Agent notes

Monorepo: `packages/server` (Hono API) + `packages/web` (Vite/React, proxies `/api` to server) + `packages/desktop` (Electron). Electron is the dev orchestrator: `pnpm dev` builds the Electron main and launches it, which picks two free ports and spawns the server and Vite as children. Vite's `/api` proxy reads `GHD_API_PORT`. The current dev URL + ports are written to `.logs/ports.json` on startup.

## Validating your own work

Close the loop before declaring done. Available tools:

- `pnpm typecheck` — TS across both packages
- `pnpm test` — vitest in both packages
- `pnpm lint` — oxlint
- `pnpm fmt:check` — oxfmt
- `pnpm dev` — Electron orchestrates server + Vite on random ports (long-running; start in background). Stdout/stderr is tee'd to `.logs/server.log`, `.logs/web.log`, and `.logs/desktop.log` — tail or read these to inspect output. Logs reset on each start; accumulate across hot reloads within a session.

For UI/UX changes, type-checks aren't enough — drive the app via the **Playwright MCP** (`.mcp.json`). Read `.logs/ports.json` first to discover the current dev URL (ports are random each session):

- `browser_navigate` to the `url` from `.logs/ports.json`
- `browser_snapshot` for the accessibility tree (preferred over screenshots for assertions)
- `browser_click`, `browser_type`, `browser_press_key` to exercise keyboard shortcuts
- `browser_console_messages` to catch runtime errors
- `browser_network_requests` to verify `/api/*` calls
- `browser_take_screenshot` only when visual confirmation is needed

Typical loop: edit → dev server hot-reloads → snapshot/interact → check console + `.logs/*` → iterate.

A `config.yaml` with valid tokens already exists locally; don't overwrite it.

## Code style

Things `oxfmt`/`oxlint` won't catch but we still care about:

- **Blank lines around React hook calls.** Separate `useEffect`, `useMemo`, `useCallback`, etc. from surrounding code and from each other with a blank line above and below. Multi-statement hook bodies are easier to scan when they aren't visually fused to neighboring lines.
