import { render } from "ink-testing-library";
import { expect, test, vi } from "vitest";
import { createSync, type NormalizedPr } from "sync";
import { ReviewPane } from "./review.js";

const pr = {
  id: 1,
  number: 7,
  repo: "o/r",
  title: "Change",
  author: "tester",
  headBranch: "fix",
  baseBranch: "main",
} as NormalizedPr;
const diff = {
  headSha: "a".repeat(40),
  files: [
    {
      path: "src/a.ts",
      status: "modified",
      lines: [
        { kind: "hunk", hunk: 1, text: "@@ -1,2 +1,3 @@" },
        { kind: "context", hunk: 1, text: "before", oldLine: 1, newLine: 1 },
        { kind: "add", hunk: 1, text: "added", newLine: 2 },
        { kind: "add", hunk: 1, text: "more", newLine: 3 },
      ],
    },
  ],
} as Awaited<ReturnType<ReturnType<typeof createSync>["getPullRequestDiff"]>>;

// Ink processes keys asynchronously; wait for each mode before sending the next key.
test("Enter details → visual line range → multiline draft → confirmation → API", async () => {
  const createReviewComment = vi.fn(async () => {});
  const onBack = vi.fn();
  const runtime = {
    getPullRequestDiff: vi.fn(async () => diff),
    createReviewComment,
  } as unknown as ReturnType<typeof createSync>;
  const ui = render(
    <ReviewPane
      runtime={runtime}
      instanceId="local"
      pr={pr}
      onBack={onBack}
      onQuit={() => {}}
    />,
  );
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("added"));
  expect(runtime.getPullRequestDiff).toHaveBeenCalledWith({
    instanceId: "local",
    repo: "o/r",
    number: 7,
  });
  ui.stdin.write("j");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("❯    1    1"));
  ui.stdin.write("j");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("❯         2"));
  ui.stdin.write("V");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("VISUAL LINE"));
  ui.stdin.write("j");
  await vi.waitFor(() =>
    expect(ui.lastFrame()).toContain("src/a.ts:2-3 RIGHT"),
  );
  ui.stdin.write("c");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("COMMENT"));
  ui.stdin.write("first line");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("first line█"));
  ui.stdin.write("\r");
  ui.stdin.write("second line");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("second line█"));
  ui.stdin.write("\x04"); // Ctrl+D reviews, but does not post
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("Post comment on"));
  expect(createReviewComment).not.toHaveBeenCalled();
  ui.stdin.write("n");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("COMMENT"));
  ui.stdin.write("\x04");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("Post comment on"));
  ui.stdin.write("y");
  await vi.waitFor(() =>
    expect(createReviewComment).toHaveBeenCalledWith({
      instanceId: "local",
      repo: "o/r",
      number: 7,
      headSha: diff.headSha,
      range: { path: "src/a.ts", side: "RIGHT", startLine: 2, endLine: 3 },
      body: "first line\nsecond line",
    }),
  );
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("Comment posted"));
  ui.stdin.write("\x1b");
  await vi.waitFor(() => expect(onBack).toHaveBeenCalledOnce());
  ui.unmount();
});
test("invalid hunk and binary file cannot post", async () => {
  const createReviewComment = vi.fn(async () => {});
  const runtime = {
    getPullRequestDiff: vi.fn(async () => ({
      ...diff,
      files: [{ path: "binary.png", status: "added", lines: [] }],
    })),
    createReviewComment,
  } as unknown as ReturnType<typeof createSync>;
  const ui = render(
    <ReviewPane
      runtime={runtime}
      instanceId="local"
      pr={pr}
      onBack={() => {}}
      onQuit={() => {}}
    />,
  );
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("No text patch"));
  ui.stdin.write("c");
  await vi.waitFor(() =>
    expect(ui.lastFrame()).toContain("select lines within one diff hunk"),
  );
  expect(createReviewComment).not.toHaveBeenCalled();
  ui.unmount();
});
