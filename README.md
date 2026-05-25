# GitHub Dashboard

A keyboard-driven dashboard for staying on top of your GitHub pull requests, reviews, and notifications. Supports multiple GitHub instances (github.com + GitHub Enterprise) side by side.

Act on a PR from your keyboard without leaving the dashboard:

- Toggle draft state
- Rerun failed CI jobs
- Change PR titles
- Approve and close PRs
- ...and more!

![Dashboard screenshot](./demo.png)

## Download

Pre-built macOS app is available from the [Releases page](https://github.com/AntonNiklasson/github-dashboard/releases).

## Keyboard shortcuts

| Key | Action |
|---|---|
| `j` / `k` or `↓` / `↑` | Move down / up |
| `h` / `l` or `←` / `→` | Move between columns |
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
| `?` | Show shortcut help |

### Inside the detail panel

| Key | Action |
|---|---|
| `h` / `l` or `←` / `→` | Switch tab (Overview / Comments / Files) |
| `j` / `k` or `↓` / `↑` | Scroll |
| `Esc` | Close panel |

## Configuration

The dashboard reads `~/.config/github-dashboard/config.yml` (honors `$XDG_CONFIG_HOME` if set). On first launch the Welcome screen offers a "Set it up for me!" button that scaffolds the file and opens it in your default editor.

The config file:

```yaml
theme: system
instances: # one or more
  - domain: github.com
    token: ghp_...
  - domain: ghe.example.com
    label: GHE
    token: ghp_...
```

- **instances** — at least one GitHub instance. List as many as you like (github.com and any number of GHES installs).
  - **domain** — `github.com` or your GHES host. Accepts a bare host (`ghe.example.com`), a URL (`https://ghe.example.com`), or the full API base — `https://` and `/api/v3` are filled in automatically. For github.com, the API base is set to `https://api.github.com`.
  - **token** — personal access token (needs `repo`, `notifications` scopes). For github.com, [create one with the scopes pre-selected](https://github.com/settings/tokens/new?scopes=repo,notifications&description=GitHub%20Dashboard).
  - **label** — optional display name in the tab strip. Defaults to the domain.
- **theme** — `system` (default), `light`, or `dark`

## Notifications

The Notifications column is intentionally narrower than GitHub's own inbox — it drops items that are either already represented elsewhere in the dashboard or are pure noise:

| Reason | Subject | Why it's dropped |
|---|---|---|
| `review_requested` | any | Shown in the Reviews column |
| `ci_activity` | any | Visible on the PR itself |
| `author` | `PullRequest` | Your own PR, shown in My work |
| `state_change` | `PullRequest` | Your own PR, shown in My work / Reviews |
| `subscribed` | any | Auto-subscription noise |

Everything else (mentions, team mentions, assignments, comments on threads you participate in, security alerts, …) flows through unchanged.

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

## Developing locally

```bash
pnpm install
pnpm dev       # full target: server + web + Electron
pnpm dev:web   # browser-only, no Electron window
```
