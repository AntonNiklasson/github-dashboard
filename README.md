# GitHub Dashboard

A keyboard-driven dashboard for staying on top of your GitHub pull requests, reviews, and notifications. Supports multiple GitHub instances (github.com + GitHub Enterprise) side by side.

Act on a PR from your keyboard without leaving the dashboard:

- Toggle draft state
- Rerun failed CI jobs
- Change PR titles
- Approve and close PRs
- ...and more!

![Dashboard screenshot](./demo.png)

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

## Architecture

```mermaid
%%{init: {'sequence': {'mirrorActors': false}}}%%
sequenceDiagram
    participant Browser
    participant Server
    participant GH as github.com
    participant GHE as GitHub Enterprise

    loop every 10s
        Browser->>Server: GET /api/*
        Server-->>Browser: cached data
    end

    loop every 30s
        Server->>GH: fetch PRs / reviews / notifications
        GH-->>Server: update cache
        Server->>GHE: fetch PRs / reviews / notifications
        GHE-->>Server: update cache
    end
```

The server keeps a disk-backed cache of the last sync and serves the browser from that, so the UI stays snappy and the API is hit at a predictable cadence regardless of how many tabs are open.
