# GitHub Dashboard

A keyboard-driven dashboard for staying on top of your GitHub pull requests, reviews, and notifications. Supports multiple GitHub instances (github.com + GitHub Enterprise) side by side.

## Features

- **Your PRs** — see all your open PRs with CI status, review state, labels, and merge queue info
- **Review requests** — PRs waiting for your review, with approval/dismiss actions
- **Notifications** — participating notifications, dismissable inline
- **Recently closed** — PRs you merged or closed today
- **Multi-instance** — connect github.com and a GitHub Enterprise instance, switch between them or view all at once
- **PR actions** — toggle draft, enable auto-merge, approve, close, rerun CI, edit title
- **Detail panel** — expand any PR to see files changed, commits, checks, and comments
- **Copy menu** — quickly copy PR URL, branch name, title, a markdown link, or a Slack-formatted message
- **Dark mode** — system, light, or dark theme
- **Onboarding UI** — configure tokens from the browser on first run

## Keyboard shortcuts

| Key | Action |
|---|---|
| `j` / `k` or `↓` / `↑` | Move down / up |
| `h` / `l` or `←` / `→` | Move between columns |
| `g g` / `g G` | Jump to top / bottom |
| `Tab` | Switch instance tab |
| `Enter` / `Space` | Open detail panel |
| `o` | Open PR in browser |
| `r` | Open repo |
| `.` | Action menu |
| `y` | Copy menu |
| `d` | Toggle draft |
| `m` | Toggle auto-merge |
| `a` | Approve PR |
| `c` | Close PR |
| `e` | Dismiss review / notification |
| `,` | Settings |
| `?` | Show shortcut help |

## Setup

```bash
pnpm install
cp config.yaml.example config.yaml
# edit config.yaml with your token(s)
pnpm dev
```

The server starts on port 7100 by default (configurable in `config.yaml`). Alternatively, skip editing the file and configure everything through the onboarding UI in the browser.

## Configuration

All configuration lives in `config.yaml`:

```yaml
port: 7100

github:
  token: ghp_...

enterprise:
  label: GHE
  baseUrl: https://ghe.example.com/api/v3
  token: ghp_...
```

- **github** — github.com personal access token (needs `repo`, `notifications` scopes)
- **enterprise** — optional GitHub Enterprise instance with its own token and base URL
- **port** — server port (default 7100)

Tokens can also be updated from the settings modal in the UI.

## Dashboard ideas

This works well as an always-on dashboard. A few ways to set that up:

- **Browser tab** — pin `http://localhost:7100` as a permanent tab
- **Separate browser window** — keep it on a secondary monitor; most browsers let you hide the address bar in a PWA-style window
- **iframe / new tab page** — embed it in a custom new-tab extension
- **Tauri / Electron** — wrap it as a native window (Tauri migration is on the roadmap)

Data syncs every 30 seconds in the background, so it stays up to date without manual refreshing.

