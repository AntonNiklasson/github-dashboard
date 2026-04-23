import { useMemo } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details",
    "summary",
    "kbd",
    "sub",
    "sup",
    "mark",
    "video",
    "source",
    "picture",
    "abbr",
    "ins",
    "del",
    "u",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "className",
      "align",
      "style",
    ],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      "loading",
      ["align", "left", "right", "center"],
      "width",
      "height",
    ],
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-/, /^hljs/],
    ],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", /^hljs/]],
    details: ["open"],
    video: ["src", "controls", "poster", "width", "height", "muted", "loop"],
    source: ["src", "type"],
  },
};

interface Props {
  body: string;
  prUrl: string;
  repo: string;
}

export function MarkdownBody({ body, prUrl, repo }: Props) {
  const baseRepoUrl = useMemo(() => {
    try {
      return new URL(`/${repo}/`, prUrl).toString();
    } catch {
      return null;
    }
  }, [prUrl, repo]);

  const urlTransform = useMemo(() => {
    return (url: string, key: string, node: { tagName?: string }) => {
      if (!url) return url;
      if (/^(https?:|mailto:|tel:|#|data:)/i.test(url)) return url;
      if (!baseRepoUrl) return url;
      const isImage = node.tagName === "img" || key === "src";
      const kind = isImage ? "raw" : "blob";
      const cleaned = url.replace(/^\.?\//, "");
      try {
        return new URL(`${kind}/HEAD/${cleaned}`, baseRepoUrl).toString();
      } catch {
        return url;
      }
    };
  }, [baseRepoUrl]);

  return (
    <div className="prose prose-sm max-w-none text-sm dark:prose-invert prose-pre:bg-muted prose-pre:text-foreground prose-code:before:hidden prose-code:after:hidden">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, sanitizeSchema],
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        urlTransform={urlTransform}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          input: ({ node: _node, ...props }) =>
            props.type === "checkbox" ? (
              <input
                {...props}
                disabled
                className="mr-1 align-middle accent-current"
              />
            ) : (
              <input {...props} />
            ),
        }}
      >
        {body}
      </Markdown>
    </div>
  );
}
