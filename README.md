# GitHub Dashboard

A local-first dashboard for managing your GitHub PRs, reviews, and notifications.

## Features

- View your open PRs across multiple GitHub instances (github.com + GitHub Enterprise)
- Track PRs awaiting your review
- See recently closed/merged PRs
- Quick actions: toggle draft, enable auto-merge, update titles
- Keyboard-driven navigation

## Setup

1. Clone the repo
2. Copy `config.yaml.example` to `config.yaml` and add your GitHub tokens
3. Run `pnpm install && pnpm dev`

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `↓` | Next item |
| `k` / `↑` | Previous item |
| `h` / `←` | Previous column |
| `l` / `→` | Next column |
| `Enter` | Open PR in browser |
| `d` | Toggle draft |
| `t` | Edit title |
| `o` | Open in GitHub |
| `m` | Toggle auto-merge |
| `?` | Show shortcuts |

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: Node.js (Hono), Octokit
- **Testing**: Vitest

## Development

```bash
pnpm dev          # Start dev servers
pnpm build        # Build for production
pnpm lint         # Run linter
pnpm test         # Run tests
```

## License

MIT
