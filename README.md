# GitHub Dashboard

A for managing your GitHub PRs, reviews, and notifications.

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
| `j` / `k` | Move down / up |
| `h` / `l` | Move between columns |
| `1` / `2` / `3` | Jump to column |
| `g g` | Jump to top |
| `g G` | Jump to bottom |
| `Enter` | Open detail panel |
| `.` | Open action menu |
| `y` | Open copy menu |
| `o` | Open PR in browser |
| `r` | Open repo |
| `d` | Toggle draft (in menu) |
| `t` | Edit title (in menu) |
| `m` | Toggle auto-merge (in menu) |
| `a` | Approve PR (in menu) |
| `c` | Close PR (in menu) |
| `,` | Settings |
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
