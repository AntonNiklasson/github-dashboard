import { Box, Text, useInput, useWindowSize } from "ink";
import { useEffect, useState } from "react";
import {
  lineRange,
  type DiffFile,
  type NormalizedPr,
  type PullRequestDiff,
  type ReviewLineRange,
  createSync,
} from "sync";

type Runtime = ReturnType<typeof createSync>;
type Mode = "browse" | "compose" | "confirm" | "sending";
const diffColors = {
  add: "#4ade80",
  delete: "#fb7185",
  hunk: "#67e8f9",
  context: "#a5b4d4",
  gutter: "#94a3b8",
  cursor: "#27334d",
  visual: "#493e31",
} as const;

// Keep provider text inert even when shown inside a highlighted diff line.
function safe(value: string): string {
  // eslint-disable-next-line no-control-regex -- terminal content must not execute provider escape sequences
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}
function cut(value: string, width: number): string {
  const text = safe(value);
  return text.length > width
    ? `${text.slice(0, Math.max(0, width - 1))}…`
    : text;
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function rangeFor(
  file: DiffFile | undefined,
  start: number | null,
  cursor: number,
): ReviewLineRange {
  if (!file) throw new Error("no diff available for this file");
  return lineRange(file, start ?? cursor, cursor);
}

export function ReviewPane({
  runtime,
  instanceId,
  pr,
  onBack,
  onQuit,
  onTab,
}: {
  runtime: Runtime;
  instanceId: string;
  pr: NormalizedPr;
  onBack: () => void;
  onQuit: () => void;
  /** Tab / Shift-Tab while browsing, e.g. to switch the host's tabs. */
  onTab?: (direction: 1 | -1) => void;
}) {
  const { columns, rows } = useWindowSize();
  const width = columns || 80;
  const height = rows || 24;
  const [diff, setDiff] = useState<PullRequestDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileIndex, setFileIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [visualStart, setVisualStart] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("browse");
  const [draft, setDraft] = useState("");
  const [posted, setPosted] = useState("");
  const file = diff?.files[fileIndex];
  const lines = file?.lines ?? [];
  const visible = Math.max(
    1,
    height - (mode === "compose" || mode === "confirm" ? 15 : 10),
  );
  const start = Math.max(0, cursor - visible + 1);

  useEffect(() => {
    let active = true;
    void runtime
      .getPullRequestDiff({ instanceId, repo: pr.repo, number: pr.number })
      .then((snapshot) => {
        if (active) {
          setDiff(snapshot);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(message(err));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [runtime, instanceId, pr.repo, pr.number]);

  const changeFile = (delta: number) => {
    if (!diff?.files.length) return;
    setFileIndex(
      (current) => (current + delta + diff.files.length) % diff.files.length,
    );
    setCursor(0);
    setVisualStart(null);
    setPosted("");
  };
  const startComment = () => {
    try {
      rangeFor(file, visualStart, cursor);
      setError(null);
      setDraft("");
      setMode("compose");
    } catch (err) {
      setError(message(err));
    }
  };
  const post = () => {
    if (!diff || !file || !draft.trim()) return;
    let range: ReviewLineRange;
    try {
      range = rangeFor(file, visualStart, cursor);
    } catch (err) {
      setError(message(err));
      setMode("browse");
      return;
    }
    setMode("sending");
    void runtime
      .createReviewComment({
        instanceId,
        repo: pr.repo,
        number: pr.number,
        headSha: diff.headSha,
        range,
        body: draft,
      })
      .then(() => {
        setPosted(
          `Comment posted on ${range.path}:${range.startLine}${range.startLine === range.endLine ? "" : `-${range.endLine}`}`,
        );
        setError(null);
        setMode("browse");
        setVisualStart(null);
        setDraft("");
      })
      .catch((err: unknown) => {
        setError(`Comment not posted: ${message(err)}`);
        setMode("compose");
      });
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onQuit();
      return;
    }
    if (mode === "sending") return;
    if (mode === "confirm") {
      if (input.toLowerCase() === "y") post();
      else if (input.toLowerCase() === "n" || key.escape) setMode("compose");
      return;
    }
    if (mode === "compose") {
      if (key.escape) {
        setMode("browse");
        setDraft("");
      } else if (key.ctrl && input === "d") {
        if (draft.trim()) setMode("confirm");
        else setError("Type a comment before submitting");
      } else if (key.return) setDraft((value) => `${value}\n`);
      else if (key.backspace || key.delete)
        setDraft((value) => value.slice(0, -1));
      else if (input && !key.ctrl && !key.meta)
        setDraft((value) => value + safe(input));
      return;
    }
    if (key.escape || input === "q") {
      if (visualStart !== null) setVisualStart(null);
      else onBack();
    } else if (key.tab && onTab) onTab(key.shift ? -1 : 1);
    else if (key.upArrow || input === "k")
      setCursor((value) => Math.max(0, value - 1));
    else if (key.downArrow || input === "j")
      setCursor((value) => Math.max(0, Math.min(lines.length - 1, value + 1)));
    else if (key.pageDown)
      setCursor((value) =>
        Math.max(0, Math.min(lines.length - 1, value + visible)),
      );
    else if (key.pageUp) setCursor((value) => Math.max(0, value - visible));
    else if (input === "]" || input === "l" || key.rightArrow) changeFile(1);
    else if (input === "[" || input === "h" || key.leftArrow) changeFile(-1);
    else if (input === "V") {
      if (lines[cursor]?.kind === "hunk" || !lines.length)
        setError("select a diff line, not a hunk header");
      else {
        setVisualStart(visualStart === null ? cursor : null);
        setError(null);
      }
    } else if (input === "c" || key.return) startComment();
  });

  const selectedStart = Math.min(visualStart ?? cursor, cursor);
  const selectedEnd = Math.max(visualStart ?? cursor, cursor);
  let rangeLabel = "";
  if (file && lines.length) {
    try {
      const range = rangeFor(file, visualStart, cursor);
      rangeLabel = `${range.path}:${range.startLine}${range.startLine === range.endLine ? "" : `-${range.endLine}`} ${range.side}`;
    } catch {
      rangeLabel =
        visualStart === null
          ? "Select a diff line"
          : "Range crosses hunks/sides — move back or Esc";
    }
  }
  const feedback = error
    ? `Error: ${error}`
    : posted ||
      (visualStart === null ? rangeLabel : `VISUAL LINE  ${rangeLabel}`);

  return (
    // Hosted in the details Diff tab, which already shows the PR title.
    <Box flexGrow={1} flexDirection="column">
      <Text color="gray" wrap="truncate-end">
        {safe(pr.author)} · {safe(pr.headBranch)} → {safe(pr.baseBranch)} ·{" "}
        {diff?.headSha.slice(0, 9) ?? "loading commit"}
      </Text>
      <Text bold color="yellow" wrap="truncate-end">
        {loading ? (
          "Loading diff…"
        ) : diff?.files.length ? (
          <>
            FILE {fileIndex + 1}/{diff.files.length} {safe(file?.path ?? "")} ·{" "}
            {safe(file?.status ?? "")}{" "}
            <Text color={diffColors.add}>
              +{lines.filter((line) => line.kind === "add").length}
            </Text>{" "}
            <Text color={diffColors.delete}>
              -{lines.filter((line) => line.kind === "delete").length}
            </Text>{" "}
            [ / ] files
          </>
        ) : (
          "No changed files"
        )}
      </Text>
      {loading ? (
        <Text color="gray">Fetching this PR from GitHub…</Text>
      ) : lines.length ? (
        lines.slice(start, start + visible).map((line, offset) => {
          const index = start + offset;
          const selected = index >= selectedStart && index <= selectedEnd;
          const color = diffColors[line.kind];
          const sign =
            line.kind === "add"
              ? "+"
              : line.kind === "delete"
                ? "-"
                : line.kind === "hunk"
                  ? "@"
                  : " ";
          return (
            <Text
              key={`${fileIndex}/${index}`}
              backgroundColor={
                selected
                  ? visualStart === null
                    ? diffColors.cursor
                    : diffColors.visual
                  : undefined
              }
              wrap="truncate-end"
            >
              <Text
                color={index === cursor ? diffColors.hunk : diffColors.gutter}
              >
                {index === cursor ? "❯" : " "}{" "}
                {String(line.oldLine ?? "").padStart(4)}{" "}
                {String(line.newLine ?? "").padStart(4)}{" "}
              </Text>
              <Text
                bold={line.kind === "add" || line.kind === "delete"}
                color={color}
              >
                {sign} {cut(line.text, width - 20)}
              </Text>
            </Text>
          );
        })
      ) : (
        <Text color="gray">
          {loading
            ? ""
            : "No text patch (binary or large file); no line comments available"}
        </Text>
      )}
      <Box flexGrow={1} />
      {(mode === "compose" || mode === "confirm" || mode === "sending") && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="yellow"
          paddingX={1}
        >
          <Text bold color="yellow">
            {mode === "confirm"
              ? `Post comment on ${rangeLabel}?  y send · n edit · Esc edit`
              : mode === "sending"
                ? "Posting comment…"
                : `COMMENT  ${rangeLabel} · Enter newline · Ctrl+D review · Esc cancel`}
          </Text>
          {draft
            .split("\n")
            .slice(-3)
            .map((line, index) => (
              <Text key={index} wrap="truncate-end">
                {cut(line, width - 9)}
                {index === draft.split("\n").slice(-3).length - 1 &&
                mode === "compose"
                  ? "█"
                  : ""}
              </Text>
            ))}
        </Box>
      )}
      <Text color={error ? "red" : "gray"} wrap="truncate-end">
        {cut(feedback, width - 6)}
      </Text>
      <Text color="gray" wrap="truncate-end">
        {mode === "browse"
          ? "j/k lines  [ ] files  V visual line  c/Enter comment  Esc back"
          : "Comments are posted only after y confirmation · Ctrl+C quits"}
      </Text>
    </Box>
  );
}
