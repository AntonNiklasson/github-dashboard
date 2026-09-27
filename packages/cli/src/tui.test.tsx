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
  expect(ui.lastFrame()).toContain("safe [2J title");
  expect(ui.lastFrame()).not.toContain("\x1b[2J");
  ui.stdin.write("j");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("second"));
  ui.stdin.write("o");
  await vi.waitFor(() =>
    expect(ui.onOpen).toHaveBeenCalledWith("https://example.com/2"),
  );
  ui.stdin.write("y");
  await vi.waitFor(() =>
    expect(ui.onCopy).toHaveBeenCalledWith("https://example.com/2"),
  );
  ui.stdin.write("/");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("SEARCH /"));
  ui.stdin.write("zzz");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("No matches"));
  ui.stdin.write("\x1b");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("safe [2J title"));
  ui.stdin.write("3");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("Mention"));
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
    await vi.waitFor(() => expect(ui.lastFrame()).toContain(`❯ item ${n}`));
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
