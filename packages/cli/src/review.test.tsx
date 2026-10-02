import { render } from "ink-testing-library";
import { expect, test, vi } from "vitest";
import { createSync, type NormalizedPr } from "sync";
import { ReviewPane, treeFileColor } from "./review.js";

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

test("tree colors only removed and renamed filenames", () => {
  expect(treeFileColor("removed")).toBe("#fb7185");
  expect(treeFileColor("renamed")).toBe("#fbbf24");
  expect(treeFileColor("modified")).toBeUndefined();
  expect(treeFileColor("added")).toBeUndefined();
});

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
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("FILES  1 changed"));
  expect(ui.lastFrame()).toContain("▾ src/");
  expect(ui.lastFrame()).not.toContain("added");
  ui.stdin.write("\r"); // expand/collapse directory
  await vi.waitFor(() => expect(ui.lastFrame()).not.toContain("a.ts"));
  ui.stdin.write("\r");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("a.ts"));
  ui.stdin.write("j");
  await vi.waitFor(() => expect(ui.lastFrame()).toMatch(/❯.*a\.ts/));
  ui.stdin.write("\r");
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
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("FILES  1 changed"));
  expect(onBack).not.toHaveBeenCalled();
  ui.stdin.write("\x1b");
  await vi.waitFor(() => expect(onBack).toHaveBeenCalledOnce());
  ui.unmount();
});
test("tree groups nested paths and opens the selected file", async () => {
  const runtime = {
    getPullRequestDiff: vi.fn(async () => ({
      headSha: diff.headSha,
      files: [
        { path: "src/z.ts", status: "added", lines: diff.files[0]!.lines },
        {
          path: "src/nested/a.ts",
          status: "modified",
          lines: diff.files[0]!.lines,
        },
        { path: "tests/a.ts", status: "modified", lines: [] },
      ],
    })),
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
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("FILES  3 changed"));
  expect(ui.lastFrame()).toContain("src/");
  expect(ui.lastFrame()).not.toContain("modified");
  expect(ui.lastFrame()).not.toContain("+2");
  expect(ui.lastFrame()).toContain("nested/");
  expect(ui.lastFrame()).toContain("tests/");
  expect(ui.lastFrame()).not.toContain("more");
  ui.stdin.write("j"); // src/nested/
  await vi.waitFor(() => expect(ui.lastFrame()).toMatch(/❯.*▾ nested\//));
  ui.stdin.write("\r");
  await vi.waitFor(() =>
    expect(ui.lastFrame()!.match(/a\.ts/g)).toHaveLength(1),
  );
  ui.stdin.write("\r");
  await vi.waitFor(() =>
    expect(ui.lastFrame()!.match(/a\.ts/g)).toHaveLength(2),
  );
  ui.stdin.write("j"); // src/nested/a.ts
  await vi.waitFor(() => expect(ui.lastFrame()).toMatch(/❯.*a\.ts/));
  expect(ui.lastFrame()).toContain("src/nested/a.ts");
  expect(ui.lastFrame()).toContain("more"); // preview, before opening the file
  expect(ui.lastFrame()).not.toContain("FILE 2/3");
  ui.stdin.write("\r");
  await vi.waitFor(() =>
    expect(ui.lastFrame()).toContain("FILE 2/3 src/nested/a.ts"),
  );
  expect(ui.lastFrame()).toContain("more");
  ui.stdin.write("\x1b");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("FILES  3 changed"));
  expect(ui.lastFrame()).toMatch(/❯.*a\.ts/);
  expect(ui.lastFrame()).toContain("├─");
  expect(ui.lastFrame()).toContain("└─");
  ui.stdin.write("j"); // src/z.ts
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("src/z.ts"));
  ui.stdin.write("j"); // tests/
  await vi.waitFor(() =>
    expect(ui.lastFrame()).toContain("Select a file to preview"),
  );
  ui.stdin.write("j"); // tests/a.ts (no text patch)
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("tests/a.ts"));
  expect(ui.lastFrame()).toContain("No text patch (binary or large file)");
  ui.unmount();
});

test("large trees scroll to the selected file", async () => {
  const runtime = {
    getPullRequestDiff: vi.fn(async () => ({
      headSha: diff.headSha,
      files: Array.from({ length: 30 }, (_, index) => ({
        path: `file-${String(index).padStart(2, "0")}.ts`,
        status: "modified",
        lines: diff.files[0]!.lines,
      })),
    })),
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
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("FILES  30 changed"));
  expect(ui.lastFrame()).not.toContain("file-29.ts");
  for (let i = 0; i < 29; i++) {
    ui.stdin.write("j");
    await vi.waitFor(() =>
      expect(ui.lastFrame()).toMatch(
        new RegExp(`❯.*file-${String(i + 1).padStart(2, "0")}\\.ts`),
      ),
    );
  }
  expect(ui.lastFrame()).not.toContain("file-00.ts");
  ui.stdin.write("\r");
  await vi.waitFor(() =>
    expect(ui.lastFrame()).toContain("FILE 30/30 file-29.ts"),
  );
  ui.unmount();
});

test("q quits directly from the diff", async () => {
  const onQuit = vi.fn();
  const onBack = vi.fn();
  const runtime = {
    getPullRequestDiff: vi.fn(async () => diff),
  } as unknown as ReturnType<typeof createSync>;
  const ui = render(
    <ReviewPane
      runtime={runtime}
      instanceId="local"
      pr={pr}
      onBack={onBack}
      onQuit={onQuit}
    />,
  );
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("FILES  1 changed"));
  ui.stdin.write("q");
  await vi.waitFor(() => expect(onQuit).toHaveBeenCalledOnce());
  expect(onBack).not.toHaveBeenCalled();
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
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("binary.png"));
  ui.stdin.write("\r");
  await vi.waitFor(() => expect(ui.lastFrame()).toContain("No text patch"));
  ui.stdin.write("c");
  await vi.waitFor(() =>
    expect(ui.lastFrame()).toContain("select lines within one diff hunk"),
  );
  expect(createReviewComment).not.toHaveBeenCalled();
  ui.unmount();
});
