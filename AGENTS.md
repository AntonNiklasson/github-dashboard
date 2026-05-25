# Agent notes

Monorepo, three packages:

- `packages/server` — Hono API, port 7100. Disk-backed cache; polls GitHub every ~30s and serves the browser from cache.
- `packages/web` — Vite/React (React 19, Tailwind v4, Jotai, TanStack Query, base-ui, shadcn). Port 7200, proxies `/api` to the server.
- `packages/desktop` — Electron wrapper. Bundles the built server (`scripts/bundle-server.mjs`) and the web `dist/` into the app; not needed for most agent work.

A pre-commit hook (`.husky/pre-commit`) runs `pnpm lint && pnpm fmt:check && pnpm typecheck && pnpm test` — fix issues at the source rather than bypassing with `--no-verify`.

## Validating your own work

Close the loop before declaring done. Available tools:

- `pnpm typecheck` — tsgo across all packages (`pnpm -r typecheck`)
- `pnpm test` — vitest in `server` and `web` (desktop has no tests)
- `pnpm lint` — oxlint
- `pnpm fmt:check` / `pnpm fmt` — oxfmt
- `pnpm dev:web` — runs server + web concurrently (long-running; start in background). For agent work prefer this over `pnpm dev`, which also rebuilds and spawns an Electron window. Stdout/stderr is tee'd to `.logs/server.log` and `.logs/web.log` — tail or read these to inspect output. Logs reset on each start; accumulate across hot reloads within a session.
- `pnpm demo:web` — same as `dev:web` but with `DEMO=1`, which serves canned fixtures instead of hitting GitHub. Useful when iterating on UI without real tokens.

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
