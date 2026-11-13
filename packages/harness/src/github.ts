import { createServer } from "node:http";

export type Phase = "in-flight" | "queued" | "queue-failed" | "offline";
export const SCENARIO_TITLE = "Ship the status board";
export const SCENARIO_TOKEN = "scenario-token";
export const SCENARIO_USER = "scenario-user";

/** A deliberately small GitHub boundary; unsupported requests fail loudly. */
export async function startGitHub() {
  let phase: Phase = "in-flight";
  const requests: { method: string; path: string; phase: Phase }[] = [];
  const server = createServer(async (req, res) => {
    const path = req.url ?? "/";
    requests.push({ method: req.method ?? "GET", path, phase });
    res.setHeader("content-type", "application/json");
    const send = (status: number, body: unknown) => {
      res.writeHead(status).end(JSON.stringify(body));
    };
    if (
      req.headers.authorization !== `token ${SCENARIO_TOKEN}` &&
      req.headers.authorization !== `bearer ${SCENARIO_TOKEN}`
    ) {
      send(401, { message: "Only scenario credentials are accepted" });
      return;
    }
    if (phase === "offline") {
      send(503, { message: "Scenario: GitHub unavailable" });
      return;
    }
    if (req.method === "GET" && path === "/api/v3/user") {
      send(200, { login: SCENARIO_USER });
      return;
    }
    if (req.method === "GET" && path.startsWith("/api/v3/notifications?")) {
      send(200, []);
      return;
    }
    if (req.method === "POST" && path === "/api/graphql") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try {
        const { query, variables } = JSON.parse(raw);
        if (
          typeof query !== "string" ||
          query.includes("mutation") ||
          !query.includes("fragment PrFields") ||
          variables.first !== 100 ||
          ![
            `author:${SCENARIO_USER} type:pr state:open`,
            `review-requested:${SCENARIO_USER} type:pr state:open`,
          ].includes(variables.q)
        ) {
          send(501, { message: "Unsupported scenario GraphQL request" });
          return;
        }
        send(200, {
          data: {
            search: {
              nodes: variables.q.startsWith("author:")
                ? [pullRequest(phase)]
                : [],
            },
            rateLimit: {
              cost: 1,
              remaining: 5000,
              resetAt: "2099-01-01T00:00:00Z",
            },
          },
        });
      } catch {
        send(400, { message: "Invalid scenario GraphQL request" });
      }
      return;
    }
    send(501, {
      message: `Unsupported scenario request: ${req.method} ${path}`,
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing simulator address");
  const domain = `http://127.0.0.1:${address.port}`;
  return {
    domain,
    instance: {
      id: `127-0-0-1-${address.port}`,
      label: "Scenario GitHub",
      baseUrl: `${domain}/api/v3`,
      token: SCENARIO_TOKEN,
    },
    requests,
    setPhase(next: Phase) {
      phase = next;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      }),
  };
}

function pullRequest(phase: Exclude<Phase, "offline">) {
  return {
    id: "PR_scenario",
    databaseId: 101,
    number: 101,
    title: SCENARIO_TITLE,
    body: "A deterministic PR for testing the status board.",
    url: "https://github.com/scenario/status-board/pull/101",
    createdAt: "2026-01-01T12:00:00Z",
    updatedAt:
      phase === "in-flight"
        ? "2026-01-01T12:00:00Z"
        : phase === "queued"
          ? "2026-01-01T12:01:00Z"
          : "2026-01-01T12:02:00Z",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    additions: 12,
    deletions: 3,
    headRefName: "feature/status-board",
    baseRefName: "main",
    author: { login: SCENARIO_USER, avatarUrl: "" },
    repository: {
      nameWithOwner: "scenario/status-board",
      autoMergeAllowed: true,
    },
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              state:
                phase === "queue-failed"
                  ? "FAILURE"
                  : phase === "queued"
                    ? "PENDING"
                    : "SUCCESS",
            },
          },
        },
      ],
    },
    reviews: { nodes: [{ state: "APPROVED", author: { login: "reviewer" } }] },
    reviewThreads: { totalCount: 0, nodes: [] },
    autoMergeRequest: null,
    mergeQueueEntry: phase === "queued" ? { id: "queue-entry" } : null,
    labels: { nodes: [] },
    comments: { totalCount: 0 },
    commitsTotal: { totalCount: 2 },
  };
}
