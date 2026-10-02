import { Box, Text } from "ink";
import { marked, type Token, type Tokens } from "marked";
import type { ReactNode } from "react";

// Maps GitHub-flavored Markdown tokens onto Ink elements. Terminal-friendly
// approximations: headings are bold + colored, code gets a background,
// HTML comments (PR templates) are dropped.
const colors = {
  heading: "#67e8f9",
  code: "#fbbf24",
  codeBackground: "#27334d",
  link: "#60a5fa",
  muted: "#a5b4d4",
  subtle: "#64748b",
} as const;
const icons = {
  unchecked: "\u{f0131}", // md-checkbox_blank_outline
  checked: "\u{f0132}", // md-checkbox_marked
  image: "", // oct-image
} as const;

// Provider text is untrusted: strip control characters (ANSI escapes).
function safe(text: string): string {
  // eslint-disable-next-line no-control-regex -- terminal content must not execute provider escape sequences
  return text.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, " ");
}
const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
function decode(text: string): string {
  return safe(
    text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, name: string) => {
      if (name[0] === "#") {
        const code =
          name[1]?.toLowerCase() === "x"
            ? parseInt(name.slice(2), 16)
            : parseInt(name.slice(1), 10);
        // Out-of-range code points would make fromCodePoint throw.
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return entities[name.toLowerCase()] ?? match;
    }),
  );
}
// Keep visible text from raw HTML (e.g. <summary>), drop comments and tags.
function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?(-->|$)/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// GitHub renders <details> collapsed unless it has `open`: keep only the
// summary of collapsed ones and unwrap open ones. Innermost blocks first.
const innermostDetails =
  /<details\b([^>]*)>((?:(?!<details\b)[\s\S])*?)<\/details\s*>/i;
function collapseDetails(source: string): string {
  let text = source;
  let match: RegExpExecArray | null;
  while ((match = innermostDetails.exec(text))) {
    const [whole, attributes = "", content = ""] = match;
    const summary = content.match(/<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/i);
    const replacement = /(^|\s)open(\s|=|$)/i.test(attributes)
      ? content.replace(/<\/?summary\b[^>]*>/gi, "")
      : `\n\n▸ ${stripHtml(summary?.[1] ?? "Details").replace(/\s+/g, " ") || "Details"}\n\n`;
    text =
      text.slice(0, match.index) +
      replacement +
      text.slice(match.index + whole.length);
  }
  return text;
}

function inline(tokens: Token[] | undefined): ReactNode[] {
  return (tokens ?? []).map((token, i) => {
    switch (token.type) {
      case "strong":
        return (
          <Text key={i} bold>
            {inline(token.tokens)}
          </Text>
        );
      case "em":
        return (
          <Text key={i} italic>
            {inline(token.tokens)}
          </Text>
        );
      case "del":
        return (
          <Text key={i} strikethrough>
            {inline(token.tokens)}
          </Text>
        );
      case "codespan":
        return (
          <Text
            key={i}
            color={colors.code}
            backgroundColor={colors.codeBackground}
          >
            {decode(token.text)}
          </Text>
        );
      case "link":
        return (
          <Text key={i} color={colors.link} underline>
            {inline(token.tokens)}
          </Text>
        );
      case "image":
        return (
          <Text key={i} color={colors.muted}>
            {icons.image} {decode(token.text || "image")}
          </Text>
        );
      case "br":
        return "\n";
      case "html":
        return stripHtml(token.text) ? decode(stripHtml(token.text)) : null;
      case "text":
        return "tokens" in token && token.tokens ? (
          <Text key={i}>{inline(token.tokens)}</Text>
        ) : (
          decode(token.text)
        );
      case "escape":
        return decode(token.text);
      default:
        return "text" in token && typeof token.text === "string"
          ? decode(token.text)
          : null;
    }
  });
}

function ListBlock({ list, depth }: { list: Tokens.List; depth: number }) {
  const start = Number(list.start) || 1;
  return (
    <Box flexDirection="column">
      {list.items.map((item, i) => {
        const marker = item.task
          ? item.checked
            ? icons.checked
            : icons.unchecked
          : list.ordered
            ? `${start + i}.`
            : depth % 2
              ? "◦"
              : "•";
        return (
          <Box key={i}>
            <Text color={item.task && item.checked ? "green" : colors.muted}>
              {marker}{" "}
            </Text>
            <Box flexDirection="column" flexShrink={1}>
              {blocks(
                item.tokens.filter((token) => token.type !== "checkbox"),
                depth + 1,
                false,
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function block(token: Token, key: number, depth: number): ReactNode {
  switch (token.type) {
    case "heading":
      return (
        <Text key={key} bold color={colors.heading} wrap="wrap">
          {inline(token.tokens)}
        </Text>
      );
    case "paragraph":
    case "text":
      return (
        <Text key={key} wrap="wrap">
          {"tokens" in token && token.tokens
            ? inline(token.tokens)
            : decode(token.text)}
        </Text>
      );
    case "list":
      return <ListBlock key={key} list={token as Tokens.List} depth={depth} />;
    case "code":
      return (
        <Box
          key={key}
          flexDirection="column"
          backgroundColor={colors.codeBackground}
          paddingX={1}
        >
          {token.text.split("\n").map((line: string, i: number) => (
            <Text key={i} color={colors.code} wrap="truncate-end">
              {safe(line) || " "}
            </Text>
          ))}
        </Box>
      );
    case "blockquote":
      return (
        <Box
          key={key}
          flexDirection="column"
          borderStyle="bold"
          borderTop={false}
          borderRight={false}
          borderBottom={false}
          borderColor={colors.subtle}
          paddingLeft={1}
        >
          {blocks(token.tokens ?? [], depth, true)}
        </Box>
      );
    case "hr":
      return (
        <Text key={key} color={colors.subtle} wrap="truncate-end">
          {"─".repeat(200)}
        </Text>
      );
    case "table": {
      const table = token as Tokens.Table;
      // Pad by raw cell text; close enough once inline markup is rendered.
      const widths = table.header.map((_, c) =>
        Math.max(
          ...[table.header, ...table.rows].map((r) => r[c]?.text.length ?? 0),
        ),
      );
      const row = (cells: Tokens.TableCell[], header: boolean, i: number) => (
        <Text key={i} bold={header} wrap="truncate-end">
          {cells.flatMap((cell, c) => [
            c ? (
              <Text key={`s${c}`} color={colors.subtle}>
                {" │ "}
              </Text>
            ) : null,
            <Text key={c}>
              {inline(cell.tokens)}
              {" ".repeat(Math.max(0, (widths[c] ?? 0) - cell.text.length))}
            </Text>,
          ])}
        </Text>
      );
      return (
        <Box key={key} flexDirection="column">
          {row(table.header, true, -1)}
          {table.rows.map((cells, i) => row(cells, false, i))}
        </Box>
      );
    }
    case "html": {
      const text = stripHtml(token.text);
      return text ? (
        <Text key={key} wrap="wrap">
          {decode(text)}
        </Text>
      ) : null;
    }
    default:
      return null;
  }
}

// `spaced` puts a blank line between blocks (top level, blockquotes); list
// items stay tight.
function blocks(tokens: Token[], depth: number, spaced: boolean) {
  const rendered = tokens
    .map((token, i) => block(token, i, depth))
    .filter((node) => node !== null);
  return spaced ? (
    <Box flexDirection="column" gap={1}>
      {rendered}
    </Box>
  ) : (
    rendered
  );
}

function contentTokens(source: string): Token[] {
  return marked
    .lexer(collapseDetails(source.replace(/\r\n?/g, "\n")), { gfm: true })
    .filter(
      (token) =>
        token.type !== "space" &&
        token.type !== "def" &&
        (token.type !== "html" || stripHtml(token.text)),
    );
}

/** Number of top-level blocks; the unit `skip` scrolls by. */
export function markdownBlocks(source: string): number {
  return contentTokens(source).length;
}

// `skip` drops leading top-level blocks, for scrolling long descriptions.
export function Markdown({
  source,
  skip = 0,
}: {
  source: string;
  skip?: number;
}) {
  const all = contentTokens(source);
  const content = all.slice(Math.min(skip, Math.max(0, all.length - 1)));
  return content.length ? (
    blocks(content, 0, true)
  ) : (
    <Text color={colors.muted}>No description</Text>
  );
}
