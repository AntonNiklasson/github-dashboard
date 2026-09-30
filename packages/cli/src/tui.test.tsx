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
  expect(ui.lastFrame()).toContain("GITHUB DASHBOARD");
  expect(ui.lastFrame()).toContain("My work 2");
  expect(ui.lastFrame()).toContain("Requested reviews 2");
  expect(ui.lastFrame()).toContain("Notifications 1");
  expect(ui.lastFrame()).not.toContain("1 My work");
  expect(ui.lastFrame()).not.toContain("2 Requested reviews");
  expect(ui.lastFrame()).not.toContain("3 Notifications");
  expect(ui.lastFrame()).toContain("MY WORK 2");
  expect(ui.lastFrame()).toContain("safe [2J title");
  expect(ui.lastFrame()).not.toContain("\x1b[2J");
  expect(ui.lastFrame()).not.toContain("by tester");
  ui.stdin.write("j");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("second"));
  ui.stdin.write("o");
  await vi.waitFor(() =>
    expect(ui.onOpen).toHaveBeenCalledWith("https://example.com/2"),
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
  ui.stdin.write("\x1b");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("safe [2J title"));
  ui.stdin.write("2");
  await vi.waitFor(() =>
    expect(ui.lastFrame()).toContain("REQUESTED REVIEWS 2"),
  );
  expect(ui.lastFrame()).toContain("by tester");
  ui.stdin.write("3");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("Mention"));
  expect(ui.lastFrame()).toContain("NOTIFICATIONS 1");
  ui.stdin.write("r");
  expect(ui.onRefresh).toHaveBeenCalledOnce();
  ui.stdin.write("?");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("HELP"));
  ui.stdin.write("q"); // first closes help, second quits
  await vi.waitFor(() => expect(ui.lastFrame()).not.toContain("HELP"));
  ui.stdin.write("q");
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
test("instance tabs live above the list and Tab filters rows", async () => {
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
  expect(ui.lastFrame()).toContain("● All");
  expect(ui.lastFrame()).toContain("Work PR");
  expect(ui.lastFrame()).toContain("Personal PR");
  expect(ui.lastFrame()).not.toContain("INSTANCES");
  ui.stdin.write("\t");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("● Work"));
  expect(ui.lastFrame()).toContain("Work PR");
  expect(ui.lastFrame()).not.toContain("Personal PR");
  ui.stdin.write("\t");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("● Personal"));
  expect(ui.lastFrame()).toContain("Personal PR");
  expect(ui.lastFrame()).not.toContain("Work PR");
  ui.unmount();
});
test("Enter shows details, Enter again reviews; Esc returns to the list", async () => {
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
  const runtime = { ...fake, getPullRequestDiff } as unknown as ReturnType<
    typeof createSync
  >;
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
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("Enter/d review"));
  expect(ui.lastFrame()).toContain("a → main");
  expect(getPullRequestDiff).not.toHaveBeenCalled();
  ui.stdin.write("\r");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("REVIEW o/r#1"));
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("new code"));
  expect(getPullRequestDiff).toHaveBeenCalledWith({
    instanceId: "x",
    repo: "o/r",
    number: 1,
  });
  ui.stdin.write("\x1b");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("Enter/d review"));
  expect(ui.lastFrame()).not.toContain("new code");
  ui.stdin.write("\x1b");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("MY WORK 2"));
  expect(ui.lastFrame()).not.toContain("Enter/d review");
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
