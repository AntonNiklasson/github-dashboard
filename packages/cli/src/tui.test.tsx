import { expect, test, vi } from "vitest";
import { render } from "ink-testing-library";
import { createSync } from "sync";
import { Dashboard } from "./tui.js";

const fake = {
  listInstances: () => [{ id: "x", label: "example", username: "tester" }],
  listPullRequests: () => [
    {
      id: 1,
      repo: "o/r",
      number: 1,
      title: "safe\x1b[2J title",
      author: "tester",
      ciStatus: "success",
      url: "https://example.com/1",
      body: "first",
      headBranch: "a",
      baseBranch: "main",
      unresolvedThreadCount: 0,
      additions: 1,
      deletions: 0,
      commits: 1,
    },
    {
      id: 2,
      repo: "o/r",
      number: 2,
      title: "second",
      author: "tester",
      ciStatus: "pending",
      url: "https://example.com/2",
      body: "second",
      headBranch: "b",
      baseBranch: "main",
      unresolvedThreadCount: 0,
      additions: 1,
      deletions: 0,
      commits: 1,
    },
  ],
  listNotifications: () => [
    {
      id: "n",
      title: "Mention",
      repo: "o/r",
      url: "https://example.com/n",
      unread: true,
      reason: "mention",
    },
  ],
} as unknown as ReturnType<typeof createSync>;

function setup() {
  const onRefresh = vi.fn();
  const onQuit = vi.fn();
  const onOpen = vi.fn(async () => {});
  const onCopy = vi.fn(async () => {});
  const app = render(
    <Dashboard
      runtime={fake}
      cycle={null}
      error={null}
      syncing={false}
      onRefresh={onRefresh}
      onQuit={onQuit}
      onOpen={onOpen}
      onCopy={onCopy}
    />,
  );
  return { ...app, onRefresh, onQuit, onOpen, onCopy };
}
test("search, tabs, instance selection, help, refresh and URL actions", async () => {
  const ui = setup();
  expect(ui.lastFrame()).not.toContain("GITHUB DASHBOARD");
  expect(ui.lastFrame()).toContain("● READY");
  // Routine sync state stays in the top bar, not a status line.
  expect(ui.lastFrame()).not.toContain("Cached data");
  expect(ui.lastFrame()).not.toContain("Refreshing");
  expect(ui.lastFrame()).toContain("My work 2");
  expect(ui.lastFrame()).toContain("Requested reviews 2");
  expect(ui.lastFrame()).toContain("Notifications 1");
  expect(ui.lastFrame()).not.toContain("1 My work");
  expect(ui.lastFrame()).not.toContain("2 Requested reviews");
  expect(ui.lastFrame()).not.toContain("3 Notifications");
  expect(ui.lastFrame()).not.toContain("MY WORK");
  expect(ui.lastFrame()).toContain("safe [2J title");
  expect(ui.lastFrame()).not.toContain("\x1b[2J");
  expect(ui.lastFrame()).not.toContain("by tester");
  ui.stdin.write("j");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("second"));
  const open = async (key: string, url: string) => {
    ui.stdin.write("o");
    await vi.waitFor(() => expect(ui.lastFrame()).toContain("OPEN"));
    ui.stdin.write(key);
    await vi.waitFor(() => expect(ui.onOpen).toHaveBeenLastCalledWith(url));
  };
  await open("o", "https://example.com/2");
  await open("c", "https://example.com/2/checks");
  await open("d", "https://example.com/2/files");
  await open(
    "a",
    "https://example.com/pulls?q=is%3Apr%20author%3Atester%20sort%3Aupdated-desc",
  );
  const copy = async (key: string, text: string) => {
    ui.stdin.write("y");
    await vi.waitFor(() => expect(ui.lastFrame()).toContain("COPY"));
    ui.stdin.write(key);
    await vi.waitFor(() => expect(ui.onCopy).toHaveBeenLastCalledWith(text));
  };
  ui.stdin.write("y");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("r review request"));
  expect(ui.lastFrame()).toContain("b branch");
  ui.stdin.write("\x1b");
  await vi.waitFor(() => expect(ui.lastFrame()).not.toContain("COPY"));
  expect(ui.onCopy).not.toHaveBeenCalled();
  await copy("u", "https://example.com/2");
  await copy("n", "#2");
  await copy("b", "b");
  await copy("r", "[second](https://example.com/2) `+1/-0`");
  await vi.waitFor(() =>
    expect(ui.lastFrame()).toContain("Copied review request"),
  );
  ui.stdin.write("/");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("SEARCH /"));
  ui.stdin.write("zzz");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("No matches"));
  expect(ui.lastFrame()).toContain("0 of 2 match");
  ui.stdin.write("\x1b");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("safe [2J title"));
  ui.stdin.write("2");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("by tester"));
  ui.stdin.write("3");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("Mention"));
  ui.stdin.write("r");
  expect(ui.onRefresh).toHaveBeenCalledOnce();
  ui.stdin.write("?");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("HELP"));
  ui.stdin.write("q"); // first closes help
  await vi.waitFor(() => expect(ui.lastFrame()).not.toContain("HELP"));
  ui.stdin.write("q"); // asks for confirmation; any other key cancels
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("QUIT?"));
  expect(ui.onQuit).not.toHaveBeenCalled();
  ui.stdin.write("x");
  await vi.waitFor(() => expect(ui.lastFrame()).not.toContain("QUIT?"));
  expect(ui.onQuit).not.toHaveBeenCalled();
  ui.stdin.write("q");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("QUIT?"));
  ui.stdin.write("\r");
  await vi.waitFor(() => expect(ui.onQuit).toHaveBeenCalledOnce());
  ui.unmount();
});
test("s opens a sort menu; field keys pick, repeat flips, per tab", async () => {
  const ui = setup();
  const order = () => {
    const frame = ui.lastFrame()!;
    return frame.indexOf("second") < frame.indexOf("safe") ? "second" : "safe";
  };
  const pick = async (key: string, expected: string) => {
    ui.stdin.write("s");
    await vi.waitFor(() => expect(ui.lastFrame()).toContain("Esc cancel"));
    ui.stdin.write(key);
    await vi.waitFor(() => expect(ui.lastFrame()).toContain(expected));
    expect(ui.lastFrame()).not.toContain("Esc cancel");
  };
  expect(ui.lastFrame()).toContain("created ↓");
  ui.stdin.write("s");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("n name"));
  expect(ui.lastFrame()).toContain("s status");
  expect(ui.lastFrame()).toContain("z size");
  ui.stdin.write("x"); // unknown key cancels without changing sort
  await vi.waitFor(() => expect(ui.lastFrame()).not.toContain("Esc cancel"));
  expect(ui.lastFrame()).toContain("created ↓");
  await pick("u", "updated ↓");
  await pick("n", "name ↑");
  expect(order()).toBe("safe");
  await pick("n", "name ↓");
  expect(order()).toBe("second");
  ui.stdin.write("S");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("name ↑"));
  await pick("s", "status ↓");
  ui.stdin.write("3");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("updated ↓"));
  ui.stdin.write("s");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("r repo"));
  expect(ui.lastFrame()).not.toContain("z size");
  ui.unmount();
});
test(". actions: draft toggle on My work, confirmed approve on reviews", async () => {
  const togglePullRequestDraft = vi.fn(async () => ({ draft: true }));
  const approvePullRequest = vi.fn(async () => {});
  const onRefresh = vi.fn();
  const runtime = {
    ...fake,
    togglePullRequestDraft,
    approvePullRequest,
  } as unknown as ReturnType<typeof createSync>;
  const ui = render(
    <Dashboard
      runtime={runtime}
      cycle={null}
      error={null}
      syncing={false}
      onRefresh={onRefresh}
      onQuit={() => {}}
    />,
  );
  ui.stdin.write(".");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("ACTION"));
  expect(ui.lastFrame()).toContain("d convert to draft");
  expect(ui.lastFrame()).toContain("m enable auto-merge");
  expect(ui.lastFrame()).not.toContain("a approve");
  ui.stdin.write("d");
  await vi.waitFor(() =>
    expect(togglePullRequestDraft).toHaveBeenCalledWith({
      instanceId: "x",
      repo: "o/r",
      number: 1,
    }),
  );
  await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  // Optimistic: the toggled PR now offers the reverse action.
  ui.stdin.write(".");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("d mark ready"));
  ui.stdin.write("\x1b");
  await vi.waitFor(() => expect(ui.lastFrame()).not.toContain("ACTION"));
  ui.stdin.write("2");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("by tester"));
  ui.stdin.write(".");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("a approve"));
  expect(ui.lastFrame()).not.toContain("d convert to draft");
  ui.stdin.write("a");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("APPROVE O/R#1?"));
  expect(approvePullRequest).not.toHaveBeenCalled();
  ui.stdin.write("y");
  await vi.waitFor(() => expect(approvePullRequest).toHaveBeenCalledOnce());
  ui.unmount();
});
test("actions update optimistically and roll back on failure", async () => {
  let settle: { resolve: (v: unknown) => void; reject: (e: unknown) => void };
  const togglePullRequestDraft = vi.fn(
    () =>
      new Promise((resolve, reject) => {
        settle = { resolve, reject };
      }),
  );
  const onRefresh = vi.fn();
  const runtime = {
    ...fake,
    togglePullRequestDraft,
  } as unknown as ReturnType<typeof createSync>;
  const ui = render(
    <Dashboard
      runtime={runtime}
      cycle={null}
      error={null}
      syncing={false}
      onRefresh={onRefresh}
      onQuit={() => {}}
    />,
  );
  const draftIcon = "\uf4dd";
  const firstRow = () =>
    ui
      .lastFrame()!
      .split("\n")
      .find((line) => line.includes("❯"))!;
  expect(firstRow()).not.toContain(draftIcon);
  ui.stdin.write(".");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("ACTION"));
  ui.stdin.write("d");
  // Shown as draft before GitHub has answered.
  await vi.waitFor(() => expect(firstRow()).toContain(draftIcon));
  expect(onRefresh).not.toHaveBeenCalled();
  settle!.resolve({ draft: true });
  await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  expect(firstRow()).toContain(draftIcon);
  // Toggle back, but GitHub rejects it: the draft state is restored.
  ui.stdin.write(".");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("d mark ready"));
  ui.stdin.write("d");
  await vi.waitFor(() => expect(firstRow()).not.toContain(draftIcon));
  settle!.reject(new Error("nope"));
  await vi.waitFor(() => expect(firstRow()).toContain(draftIcon));
  expect(ui.lastFrame()).toContain("mark ready failed: nope");
  ui.unmount();
});
test("starts from remembered sorts and reports state changes", async () => {
  const onStateChange = vi.fn();
  const ui = render(
    <Dashboard
      runtime={fake}
      cycle={null}
      error={null}
      syncing={false}
      initialSorts={{
        prs: { field: "name", dir: "asc" },
        reviews: { field: "updated", dir: "desc" },
        notifications: { field: "updated", dir: "desc" },
      }}
      onStateChange={onStateChange}
      onRefresh={() => {}}
      onQuit={() => {}}
    />,
  );
  expect(ui.lastFrame()).toContain("name ↑");
  ui.stdin.write("s");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("SORT"));
  ui.stdin.write("u");
  await vi.waitFor(() =>
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "prs",
        instanceId: "x",
        sorts: expect.objectContaining({
          prs: { field: "updated", dir: "desc" },
        }),
      }),
    ),
  );
  ui.stdin.write("2");
  await vi.waitFor(() =>
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "reviews" }),
    ),
  );
  ui.unmount();
});
test("notifications: Enter opens in browser, e marks done optimistically", async () => {
  let fail = false;
  const markNotificationDone = vi.fn(async () => {
    if (fail) throw new Error("nope");
  });
  const onOpen = vi.fn(async () => {});
  const onRefresh = vi.fn();
  const runtime = {
    ...fake,
    markNotificationDone,
  } as unknown as ReturnType<typeof createSync>;
  const ui = render(
    <Dashboard
      runtime={runtime}
      initialKind="notifications"
      cycle={null}
      error={null}
      syncing={false}
      onRefresh={onRefresh}
      onQuit={() => {}}
      onOpen={onOpen}
    />,
  );
  expect(ui.lastFrame()).toContain("Mention");
  expect(ui.lastFrame()).toContain("e done");
  ui.stdin.write("\r");
  await vi.waitFor(() =>
    expect(onOpen).toHaveBeenCalledWith("https://example.com/n"),
  );
  expect(ui.lastFrame()).not.toContain("Tab/1-3 tabs"); // no details screen
  // o opens it directly too, no menu.
  onOpen.mockClear();
  ui.stdin.write("o");
  await vi.waitFor(() =>
    expect(onOpen).toHaveBeenCalledWith("https://example.com/n"),
  );
  expect(ui.lastFrame()).not.toContain("OPEN");
  fail = true;
  ui.stdin.write("e");
  await vi.waitFor(() =>
    expect(ui.lastFrame()).toContain("Mark done failed: nope"),
  );
  expect(ui.lastFrame()).toContain("Mentioned");
  fail = false;
  ui.stdin.write("e");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("No cached items"));
  expect(markNotificationDone).toHaveBeenLastCalledWith({
    instanceId: "x",
    id: "n",
  });
  await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
  ui.unmount();
});
test("queued PRs get the merge-queue icon and no auto-merge line", () => {
  const template = fake.listPullRequests("x", "prs")[0]!;
  const runtime = {
    ...fake,
    listPullRequests: () => [
      { ...template, autoMerge: true, inMergeQueue: true },
      { ...template, id: 2, number: 2, title: "armed", autoMerge: true },
    ],
  } as unknown as ReturnType<typeof createSync>;
  const ui = render(
    <Dashboard
      runtime={runtime}
      cycle={null}
      error={null}
      syncing={false}
      onRefresh={() => {}}
      onQuit={() => {}}
    />,
  );
  const frame = ui.lastFrame()!;
  const queued = frame.split("\n").find((line) => line.includes("safe"))!;
  expect(queued).toContain("\uf4db");
  expect(queued).not.toContain("\uf407");
  // The icon and yellow title carry it; no second indicator in the row.
  expect(frame).not.toContain("In merge queue");
  // Only the armed (not yet queued) PR shows the auto-merge line.
  expect(frame.match(/auto-merge/g)).toHaveLength(1);
  ui.unmount();
});
test("long list stays inside viewport and scrolls with selection", async () => {
  const many = {
    ...fake,
    listPullRequests: () =>
      Array.from({ length: 30 }, (_, index) => ({
        id: index,
        repo: "o/r",
        number: index,
        title: `item ${index}`,
        url: `https://example.com/${index}`,
        author: "tester",
        ciStatus: "success",
        body: "",
        headBranch: "b",
        baseBranch: "main",
        unresolvedThreadCount: 0,
        additions: 0,
        deletions: 0,
        commits: 1,
      })),
  } as ReturnType<typeof createSync>;
  const ui = render(
    <Dashboard
      runtime={many}
      cycle={null}
      error={null}
      syncing={false}
      onRefresh={() => {}}
      onQuit={() => {}}
    />,
  );
  expect(ui.lastFrame()).toContain("item 0");
  expect(ui.lastFrame()).not.toContain("item 29");
  expect(ui.lastFrame()).toContain("q quit");
  for (let n = 1; n <= 10; n++) {
    ui.stdin.write("j");
    await vi.waitFor(() =>
      expect(ui.lastFrame()).toContain(`❯ \uf407 item ${n}`),
    );
  }
  expect(ui.lastFrame()).not.toContain("item 0");
  expect(ui.lastFrame()).toContain("q quit");
  ui.unmount();
});
test("one instance at a time; i cycles it, Tab switches views", async () => {
  const template = fake.listPullRequests("x", "prs")[0]!;
  const other = {
    ...fake,
    listInstances: () => [
      { id: "x", label: "Work", username: "tester" },
      { id: "y", label: "Personal", username: "tester" },
    ],
    listPullRequests: (id: string) =>
      id === "x"
        ? [
            {
              ...template,
              id: 1,
              repo: "work/repo",
              number: 1,
              title: "Work PR",
              url: "https://example.com/1",
            },
          ]
        : [
            {
              ...template,
              id: 2,
              repo: "personal/repo",
              number: 2,
              title: "Personal PR",
              url: "https://example.com/2",
            },
          ],
  } as unknown as ReturnType<typeof createSync>;
  const ui = render(
    <Dashboard
      runtime={other}
      cycle={null}
      error={null}
      syncing={false}
      onRefresh={() => {}}
      onQuit={() => {}}
    />,
  );
  // One instance at a time: no combined "All" view; first instance by default.
  expect(ui.lastFrame()).not.toContain("All");
  expect(ui.lastFrame()).toContain("● Work");
  expect(ui.lastFrame()).toContain("Work PR");
  expect(ui.lastFrame()).not.toContain("Personal PR");
  ui.stdin.write("]");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("● Personal"));
  expect(ui.lastFrame()).toContain("Personal PR");
  expect(ui.lastFrame()).not.toContain("Work PR");
  // i cycles to the next instance and wraps around, no menu.
  ui.stdin.write("i");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("● Work"));
  expect(ui.lastFrame()).toContain("Work PR");
  expect(ui.lastFrame()).not.toContain("Personal PR");
  expect(ui.lastFrame()).not.toContain("INSTANCE");
  ui.stdin.write("i");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("● Personal"));
  ui.stdin.write("i");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("● Work"));
  // Tab cycles views, not instances.
  ui.stdin.write("\t");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("updated ↓"));
  expect(ui.lastFrame()).toContain("● Work");
  ui.stdin.write("\t");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("Mention"));
  ui.stdin.write("\t");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("created ↓"));
  ui.unmount();
});
test("details tabs: description, comments (lazy), diff; Esc to list", async () => {
  const getPullRequestDiff = vi.fn(async () => ({
    headSha: "a".repeat(40),
    files: [
      {
        path: "src/a.ts",
        status: "modified",
        lines: [
          { kind: "hunk", hunk: 1, text: "@@ -1 +1 @@" },
          { kind: "add", hunk: 1, newLine: 1, text: "new code" },
        ],
      },
    ],
  }));
  const getPullRequestComments = vi.fn(async () => [
    {
      id: 1,
      author: "reviewer",
      body: "Please **rename** this",
      createdAt: new Date().toISOString(),
      path: "src/a.ts",
      line: 1,
      inReplyToId: null,
    },
    {
      id: 2,
      author: "tester",
      body: "Done",
      createdAt: new Date().toISOString(),
      path: "src/a.ts",
      line: 1,
      inReplyToId: 1,
    },
  ]);
  const runtime = {
    ...fake,
    getPullRequestDiff,
    getPullRequestComments,
  } as unknown as ReturnType<typeof createSync>;
  const ui = render(
    <Dashboard
      runtime={runtime}
      cycle={null}
      error={null}
      syncing={false}
      onRefresh={() => {}}
      onQuit={() => {}}
    />,
  );
  ui.stdin.write("\r");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("Tab/1-3 tabs"));
  expect(ui.lastFrame()).toContain("Description");
  expect(ui.lastFrame()).toContain("a → main");
  expect(getPullRequestComments).not.toHaveBeenCalled();
  expect(getPullRequestDiff).not.toHaveBeenCalled();
  ui.stdin.write("\t");
  await vi.waitFor(() =>
    expect(ui.lastFrame()).toContain("Please rename this"),
  );
  expect(ui.lastFrame()).toContain("src/a.ts:1");
  expect(ui.lastFrame()).toContain("Done");
  expect(getPullRequestComments).toHaveBeenCalledWith({
    instanceId: "x",
    repo: "o/r",
    number: 1,
  });
  ui.stdin.write("\t");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("FILE 1/1 src/a.ts"));
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("new code"));
  expect(getPullRequestDiff).toHaveBeenCalledWith({
    instanceId: "x",
    repo: "o/r",
    number: 1,
  });
  // Tab inside the diff hands back to the details tabs (wraps to Description).
  ui.stdin.write("\t");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("a → main"));
  expect(ui.lastFrame()).not.toContain("new code");
  ui.stdin.write("2");
  await vi.waitFor(() =>
    expect(ui.lastFrame()).toContain("Please rename this"),
  );
  expect(getPullRequestComments).toHaveBeenCalledOnce(); // cached per PR
  ui.stdin.write("3");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("new code"));
  ui.stdin.write("\x1b");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("Enter details"));
  expect(ui.lastFrame()).not.toContain("new code");
  ui.unmount();
});

test("partial sync failure visible without losing cached items", () => {
  const ui = render(
    <Dashboard
      runtime={fake}
      cycle={{
        startedAt: "",
        finishedAt: "now",
        results: [
          {
            instanceId: "x",
            fetches: [
              {
                kind: "prs",
                status: "failed",
                count: 0,
                reason: "provider down",
              },
            ],
          },
        ],
      }}
      error={null}
      syncing={false}
      onRefresh={() => {}}
      onQuit={() => {}}
    />,
  );
  expect(ui.lastFrame()).toContain("provider down");
  expect(ui.lastFrame()).toContain("safe [2J title");
  ui.unmount();
});
