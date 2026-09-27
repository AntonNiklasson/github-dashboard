import { expect, test } from "vitest";
import { createSync } from "sync";
import { render } from "./tui.js";

test("renders cached rows, selection, failures and sanitizes provider text", () => {
  const runtime = {
    listInstances: () => [{ id: "x", label: "example", username: "tester" }],
    listPullRequests: () => [
      {
        repo: "o/r",
        number: 1,
        title: "safe\x1b[2J title",
        author: "tester",
        ciStatus: "success",
        url: "https://example.com/1",
      },
      {
        repo: "o/r",
        number: 2,
        title: "second",
        author: "tester",
        ciStatus: "pending",
        url: "https://example.com/2",
      },
    ],
    listNotifications: () => [],
  } as unknown as ReturnType<typeof createSync>;
  const screen = render(
    runtime,
    {
      tab: "prs",
      index: 1,
      instanceId: undefined,
      syncing: false,
      error: "offline",
      cycle: null,
    },
    80,
    20,
  );
  expect(screen).toContain("❯ example · o/r#2 · second");
  expect(screen).toContain("Error: offline");
  expect(screen).toContain("safe [2J title");
  expect(screen.split("\x1b")).toHaveLength(3); // only cursor-home and clear-screen
});
