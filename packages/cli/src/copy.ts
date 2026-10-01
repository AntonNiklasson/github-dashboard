import type { createSync, NormalizedPr } from "sync";

// Second key after `y`. Mirrors the web CopyMenu (packages/web/src/components/CopyMenu.tsx).
export type CopyOption = {
  key: string;
  label: string;
  value: () => string | Promise<string>;
};

type Runtime = ReturnType<typeof createSync>;
type Copyable = { instanceId: string; url: string; pr?: NormalizedPr };

export function copyOptions(item: Copyable, runtime: Runtime): CopyOption[] {
  const url: CopyOption[] = /^https?:\/\//i.test(item.url)
    ? [{ key: "u", label: "URL", value: () => item.url }]
    : [];
  const pr = item.pr;
  if (!pr) return url;
  return [
    { key: "n", label: "number", value: () => `#${pr.number}` },
    ...url,
    ...(pr.headBranch
      ? [{ key: "b", label: "branch", value: () => pr.headBranch }]
      : []),
    {
      key: "r",
      label: "review request",
      value: () =>
        `[${pr.title}](${item.url}) \`+${pr.additions}/-${pr.deletions}\``,
    },
    {
      key: "f",
      label: "changed files",
      value: async () => {
        const diff = await runtime.getPullRequestDiff({
          instanceId: item.instanceId,
          repo: pr.repo,
          number: pr.number,
        });
        return diff.files.map((file) => file.path).join("\n");
      },
    },
  ];
}
