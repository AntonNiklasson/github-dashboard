# Agent notes

## Dev logs

When `pnpm dev` is running, server and web stdout/stderr are tee'd to:

- `.logs/server.log` — `tsx watch src/index.ts`
- `.logs/web.log` — `vite`

Tail or read these files to inspect dev output. Logs reset on each `pnpm dev` start; accumulate across hot reloads within a session.
