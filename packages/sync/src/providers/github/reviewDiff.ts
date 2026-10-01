import type { GitHubInstance } from "../../config.js";
import { getClient } from "./client.js";

export interface DiffLine {
  kind: "hunk" | "context" | "add" | "delete";
  text: string;
  hunk: number;
  oldLine?: number;
  newLine?: number;
}
export interface DiffFile {
  path: string;
  status: string;
  lines: DiffLine[];
}
export interface PullRequestDiff {
  headSha: string;
  files: DiffFile[];
}

export function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let hunk = 0;
  for (const text of patch.split("\n")) {
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      hunk++;
      lines.push({ kind: "hunk", hunk, text });
    } else if (hunk && text.startsWith("+")) {
      lines.push({
        kind: "add",
        hunk,
        text: text.slice(1),
        newLine: newLine++,
      });
    } else if (hunk && text.startsWith("-")) {
      lines.push({
        kind: "delete",
        hunk,
        text: text.slice(1),
        oldLine: oldLine++,
      });
    } else if (hunk && text.startsWith(" ")) {
      lines.push({
        kind: "context",
        hunk,
        text: text.slice(1),
        oldLine: oldLine++,
        newLine: newLine++,
      });
    }
    // Ignore the final empty line and "\\ No newline at end of file" markers.
  }
  return lines;
}

export interface ReviewLineRange {
  path: string;
  side: "LEFT" | "RIGHT";
  startLine: number;
  endLine: number;
}

// GitHub requires the range to belong to one hunk and one diff side.
// Context lines have coordinates on both sides; mixed additions/deletions do not.
export function lineRange(
  file: DiffFile,
  start: number,
  end: number,
): ReviewLineRange {
  const selected = file.lines.slice(
    Math.min(start, end),
    Math.max(start, end) + 1,
  );
  if (
    !selected.length ||
    selected.some(
      (line) => line.kind === "hunk" || line.hunk !== selected[0]!.hunk,
    )
  ) {
    throw new Error("select lines within one diff hunk");
  }
  const hasAdds = selected.some((line) => line.kind === "add");
  const hasDeletes = selected.some((line) => line.kind === "delete");
  if (hasAdds && hasDeletes)
    throw new Error("a comment cannot span both sides of a diff");
  const side = hasDeletes ? "LEFT" : "RIGHT";
  const first = selected[0]!;
  const last = selected.at(-1)!;
  const startLine = side === "LEFT" ? first.oldLine : first.newLine;
  const endLine = side === "LEFT" ? last.oldLine : last.newLine;
  if (!startLine || !endLine)
    throw new Error("selected lines are not commentable");
  return { path: file.path, side, startLine, endLine };
}

export async function fetchPullRequestDiff(
  instance: GitHubInstance,
  repo: string,
  number: number,
): Promise<PullRequestDiff> {
  const [owner, name] = splitRepo(repo);
  const client = getClient(instance);
  const { data: pr } = await client.pulls.get({
    owner,
    repo: name,
    pull_number: number,
  });
  const files = await client.paginate(client.pulls.listFiles, {
    owner,
    repo: name,
    pull_number: number,
    per_page: 100,
  });
  return {
    headSha: pr.head.sha,
    files: files.map((file) => ({
      path: file.filename,
      status: file.status,
      lines: file.patch ? parsePatch(file.patch) : [],
    })),
  };
}

export async function postReviewComment(
  instance: GitHubInstance,
  input: {
    repo: string;
    number: number;
    headSha: string;
    range: ReviewLineRange;
    body: string;
  },
): Promise<void> {
  const [owner, name] = splitRepo(input.repo);
  if (
    !Number.isSafeInteger(input.number) ||
    input.number < 1 ||
    !/^[a-f0-9]{40}$/i.test(input.headSha) ||
    !input.body.trim() ||
    !input.range.path ||
    input.range.startLine < 1 ||
    input.range.endLine < input.range.startLine
  ) {
    throw new Error("invalid review comment");
  }
  const client = getClient(instance);
  await client.pulls.createReviewComment({
    owner,
    repo: name,
    pull_number: input.number,
    commit_id: input.headSha,
    path: input.range.path,
    line: input.range.endLine,
    side: input.range.side,
    ...(input.range.startLine !== input.range.endLine
      ? { start_line: input.range.startLine, start_side: input.range.side }
      : {}),
    body: input.body.trim(),
  });
}

export function splitRepo(repo: string): [string, string] {
  const parts = repo.split("/");
  // Each part needs an alphanumeric so "." / ".." can't form a path.
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[\w.-]+$/.test(part) || !/[a-z0-9]/i.test(part))
  )
    throw new Error("invalid repository identity");
  return [parts[0]!, parts[1]!];
}
