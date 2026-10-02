import { render } from "ink-testing-library";
import { expect, test } from "vitest";
import { CommentsView, commentThreads } from "./comments.js";

test("hidden comments show the reason instead of the body", () => {
  const ui = render(
    <CommentsView
      threads={commentThreads([
        {
          id: 1,
          author: "coverage-bot",
          body: "huge coverage table",
          createdAt: "2026-01-01T00:00:00Z",
          path: null,
          line: null,
          inReplyToId: null,
          minimized: "outdated",
        },
      ])}
      skip={0}
    />,
  );
  expect(ui.lastFrame()).toContain("coverage-bot");
  expect(ui.lastFrame()).toContain("Hidden on GitHub as outdated");
  expect(ui.lastFrame()).not.toContain("huge coverage table");
  ui.unmount();
});
