import { expect, test } from "vitest";
import type { NormalizedPr } from "sync";
import { stackPrs } from "./stack.js";

const entry = (id: string, head: string, base: string, repo = "o/r") => ({
  id,
  instanceId: "x",
  repo,
  pr: { headBranch: head, baseBranch: base } as NormalizedPr,
});
const shape = (rows: ReturnType<typeof stackPrs<ReturnType<typeof entry>>>) =>
  rows.map((row) => `${row.depth}:${row.entry.id}:${row.size}:${row.last}`);

test("nests PRs targeting another listed PR's head branch", () => {
  const rows = stackPrs([
    entry("top", "c", "b"),
    entry("solo", "s", "main"),
    entry("mid", "b", "a"),
    entry("root", "a", "main"),
  ]);
  expect(shape(rows)).toEqual([
    "0:solo:0:false",
    "0:root:2:false",
    "1:mid:0:false",
    "1:top:0:true",
  ]);
});

test("same branch names in other repos don't stack", () => {
  const rows = stackPrs([
    entry("a", "x", "main"),
    entry("b", "y", "x", "o/other"),
  ]);
  expect(rows.every((row) => row.depth === 0)).toBe(true);
});

test("branch cycles still surface every PR", () => {
  const rows = stackPrs([entry("a", "x", "y"), entry("b", "y", "x")]);
  expect(rows.map((row) => row.entry.id).sort()).toEqual(["a", "b"]);
});
