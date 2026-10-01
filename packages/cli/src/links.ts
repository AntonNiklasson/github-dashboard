import type { NormalizedPr } from "sync";

// Second key after `o`: places to open the selected item in the browser.
export type OpenOption = { key: string; label: string; url: string };

type Openable = { url: string; pr?: NormalizedPr };

const isWeb = (url: string) => /^https?:\/\//i.test(url);

export function openOptions(item: Openable): OpenOption[] {
  if (!isWeb(item.url)) return [];
  const pr = item.pr;
  if (!pr) return [{ key: "o", label: "open", url: item.url }];
  // Same derivation as the web app: the PR URL minus /pull/N is the repo.
  const repoUrl = item.url.replace(/\/pull\/\d+.*$/, "");
  const query = `is:pr author:${pr.author} sort:updated-desc`;
  return [
    { key: "o", label: "PR", url: item.url },
    { key: "c", label: "checks", url: `${item.url}/checks` },
    { key: "d", label: "diff", url: `${item.url}/files` },
    {
      key: "a",
      label: `${pr.author}'s PRs`,
      url: `${new URL(item.url).origin}/pulls?q=${encodeURIComponent(query)}`,
    },
    { key: "r", label: "repo", url: repoUrl },
  ];
}
