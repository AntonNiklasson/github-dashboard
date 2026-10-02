import { Box, Text } from "ink";
import type { PrComment } from "sync";
import { Markdown } from "./markdown.js";
import { ago } from "./time.js";

const colors = {
  author: "#67e8f9",
  muted: "#a5b4d4",
  subtle: "#64748b",
} as const;

// Provider text is untrusted: strip control characters (ANSI escapes).
function safe(text: string): string {
  // eslint-disable-next-line no-control-regex -- terminal content must not execute provider escape sequences
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}

export type Thread = { root: PrComment; replies: PrComment[] };

// Conversation comments stand alone; inline review replies attach to their
// thread root. Ordered by when each thread started.
export function commentThreads(comments: PrComment[]): Thread[] {
  const byId = new Map<number, Thread>();
  const threads: Thread[] = [];
  for (const comment of comments) {
    const root = comment.inReplyToId ? byId.get(comment.inReplyToId) : null;
    if (root) root.replies.push(comment);
    else {
      const thread = { root: comment, replies: [] };
      byId.set(comment.id, thread);
      threads.push(thread);
    }
  }
  return threads;
}

function Comment({ comment, reply }: { comment: PrComment; reply: boolean }) {
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text bold color={colors.author}>
          {safe(comment.author)}
        </Text>
        <Text color={colors.muted}> · {ago(comment.createdAt)}</Text>
        {!reply && comment.path && (
          <Text color={colors.subtle}>
            {" "}
            · {safe(comment.path)}
            {comment.line ? `:${comment.line}` : ""}
          </Text>
        )}
      </Text>
      {comment.minimized ? (
        <Text color={colors.subtle}>
          ▸ Hidden on GitHub as {safe(comment.minimized)}
        </Text>
      ) : (
        <Markdown source={comment.body} />
      )}
    </Box>
  );
}

// `skip` scrolls by thread.
export function CommentsView({
  threads,
  skip,
}: {
  threads: Thread[];
  skip: number;
}) {
  if (!threads.length) return <Text color={colors.muted}>No comments</Text>;
  return (
    <Box flexDirection="column" gap={1}>
      {threads.slice(skip).map(({ root, replies }) => (
        <Box key={root.id} flexDirection="column">
          <Comment comment={root} reply={false} />
          {replies.map((reply) => (
            <Box
              key={reply.id}
              flexDirection="column"
              marginTop={1}
              borderStyle="bold"
              borderTop={false}
              borderRight={false}
              borderBottom={false}
              borderColor={colors.subtle}
              paddingLeft={1}
            >
              <Comment comment={reply} reply />
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
