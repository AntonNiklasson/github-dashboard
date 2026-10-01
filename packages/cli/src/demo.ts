import type {
  createSync,
  Instance,
  NormalizedPr,
  Notification,
  SyncResult,
} from "sync";

// Hardcoded data for `ghd tui --demo`: previews layouts (e.g. PR stacks)
// without a config or network. Nothing is persisted.
type Runtime = ReturnType<typeof createSync>;

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString();

const instances: Instance[] = [
  { id: "github", label: "github.com", username: "anton-niklasson" },
  { id: "ghe", label: "ghe.example.com", username: "anton" },
];

let nextId = 1;
function pr(overrides: Partial<NormalizedPr>): NormalizedPr {
  const id = nextId++;
  return {
    id,
    number: 6000 + id,
    title: `Demo PR ${id}`,
    body: "## Summary\nDemo data for previewing the dashboard layout.\n\n- one\n- two",
    url: `https://github.com/sana-labs/sana-ai/pull/${6000 + id}`,
    repo: "sana-labs/sana-ai",
    createdAt: hoursAgo(48 + id),
    updatedAt: hoursAgo(id * 3),
    author: "anton-niklasson",
    authorAvatar: "",
    draft: false,
    ciStatus: "success",
    inMergeQueue: false,
    autoMerge: false,
    autoMergeAllowed: true,
    headBranch: `an/demo-${id}`,
    baseBranch: "main",
    reviews: { approved: [], changesRequested: [] },
    reviewDecision: "REVIEW_REQUIRED",
    mergeStateStatus: "CLEAN",
    unresolvedThreadCount: 0,
    additions: 10 * id,
    deletions: 3 * id,
    commits: id,
    commentCount: id % 4,
    labels: [],
    mergeable: true,
    ...overrides,
  };
}

const prs: Record<string, NormalizedPr[]> = {
  github: [
    // A three-PR stack: main ← sync-runtime ← sync-diffs ← sync-comments.
    pr({
      title: "feat(sync): extract sync runtime package",
      headBranch: "an/sync-runtime",
      reviewDecision: "APPROVED",
      reviews: { approved: ["reviewer"], changesRequested: [] },
      commentCount: 5,
    }),
    pr({
      title: "feat(sync): fetch PR diffs",
      headBranch: "an/sync-diffs",
      baseBranch: "an/sync-runtime",
      ciStatus: "pending",
      unresolvedThreadCount: 2,
    }),
    pr({
      title: "feat(cli): comment on selected diff lines",
      headBranch: "an/sync-comments",
      baseBranch: "an/sync-diffs",
      draft: true,
      reviewDecision: null,
      mergeStateStatus: "DIRTY",
      mergeable: false,
    }),
    // Standalone PRs.
    pr({
      title:
        "AI-17634: Run the Sana AI e2e gating scenarios through the image entrypoint",
      repo: "scylla/scylla",
      ciStatus: "failure",
      commentCount: 7,
      labels: ["size/L"],
    }),
    pr({
      title: "AI-14419: upgrade pnpm to 12.4.2",
      autoMerge: true,
      reviewDecision: "APPROVED",
    }),
    // A two-PR stack in another repo; same branch names elsewhere don't stack.
    pr({
      title: "AI-18126: keep frontend ingress resources from being pruned",
      repo: "sana-labs/sana-ai-manifests",
      headBranch: "an/ingress",
    }),
    pr({
      title:
        "AI-18126: drop prune-disabled annotations from frontend resources",
      repo: "sana-labs/sana-ai-manifests",
      headBranch: "an/ingress-cleanup",
      baseBranch: "an/ingress",
      draft: true,
      reviewDecision: null,
    }),
  ],
  ghe: [
    pr({
      title: "Migrate internal tooling to Node 24",
      repo: "platform/tooling",
      author: "anton",
      reviewDecision: "CHANGES_REQUESTED",
      reviews: { approved: [], changesRequested: ["lead"] },
    }),
  ],
};

const reviews: Record<string, NormalizedPr[]> = {
  github: [
    pr({
      title: "feat(web): add dark mode toggle",
      author: "teammate",
      headBranch: "tm/dark-mode",
    }),
    pr({
      title: "feat(web): persist theme preference",
      author: "teammate",
      headBranch: "tm/dark-mode-persist",
      baseBranch: "tm/dark-mode",
    }),
  ],
  ghe: [],
};

const notifications: Record<string, Notification[]> = {
  github: [
    {
      id: "n1",
      title: "AI-17634: Run the Sana AI e2e gating scenarios",
      type: "PullRequest",
      reason: "mention",
      repo: "scylla/scylla",
      url: "https://github.com/scylla/scylla/pull/37719",
      unread: true,
      updatedAt: hoursAgo(1),
    },
  ],
  ghe: [],
};

export function createDemoRuntime(): Runtime {
  const result = (): SyncResult => {
    const now = new Date().toISOString();
    return { startedAt: now, finishedAt: now, results: [] };
  };
  const runtime = {
    sync: async () => result(),
    close: async () => {},
    listInstances: () => instances,
    listPullRequests: (instanceId: string, kind: "prs" | "reviews") =>
      (kind === "prs" ? prs : reviews)[instanceId] ?? [],
    listNotifications: (instanceId: string) => notifications[instanceId] ?? [],
    getPullRequestDiff: async () => ({
      headSha: "0".repeat(40),
      files: [
        {
          path: "src/demo.ts",
          status: "modified",
          lines: [
            { kind: "hunk", hunk: 1, text: "@@ -1,2 +1,2 @@" },
            {
              kind: "context",
              hunk: 1,
              oldLine: 1,
              newLine: 1,
              text: "const a = 1;",
            },
            { kind: "delete", hunk: 1, oldLine: 2, text: "const b = 2;" },
            { kind: "add", hunk: 1, newLine: 2, text: "const b = 3;" },
          ],
        },
      ],
    }),
    getPullRequestComments: async () => [
      {
        id: 1,
        author: "reviewer",
        body: "Looks good overall. Could we **split** the cache migration out?",
        createdAt: hoursAgo(20),
        path: null,
        line: null,
        inReplyToId: null,
      },
      {
        id: 2,
        author: "reviewer",
        body: "Nit: `enqueue` could return the work promise directly.",
        createdAt: hoursAgo(18),
        path: "packages/sync/src/engine.ts",
        line: 42,
        inReplyToId: null,
      },
      {
        id: 3,
        author: "anton-niklasson",
        body: "Good call, done in the latest push.",
        createdAt: hoursAgo(10),
        path: "packages/sync/src/engine.ts",
        line: 42,
        inReplyToId: 2,
      },
    ],
    createReviewComment: async () => {
      throw new Error("demo mode: comments are not posted");
    },
    // Actions "succeed" locally so menus can be tried; nothing is sent.
    approvePullRequest: async () => {},
    togglePullRequestDraft: async ({ number }: { number: number }) => {
      const pr = Object.values(prs)
        .flat()
        .find((p) => p.number === number);
      if (pr) pr.draft = !pr.draft;
      return { draft: pr?.draft ?? false };
    },
    togglePullRequestAutoMerge: async ({ number }: { number: number }) => {
      const pr = Object.values(prs)
        .flat()
        .find((p) => p.number === number);
      if (pr) pr.autoMerge = !pr.autoMerge;
      return { autoMerge: pr?.autoMerge ?? false };
    },
  };
  return runtime as unknown as Runtime;
}
