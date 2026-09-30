import type { NormalizedPr } from "sync";

type Stackable = { instanceId: string; repo: string; pr?: NormalizedPr };
export type Stacked<T> = {
  entry: T;
  /** 0 for roots, 1 for PRs stacked on top of a root. */
  depth: 0 | 1;
  /** Last sub-PR of its stack, used to close the tree gutter. */
  last: boolean;
  /** Number of sub-PRs, set on roots only. */
  size: number;
};

const key = (item: Stackable, branch: string) =>
  `${item.instanceId}\0${item.repo}\0${branch}`;

// A PR whose base branch is another listed PR's head branch belongs to that
// PR's stack. Stacks flatten into one sub-list under the bottom-most PR, in
// merge order, keeping the input (sorted) order for roots and siblings.
export function stackPrs<T extends Stackable>(items: T[]): Stacked<T>[] {
  const byHead = new Map<string, T>();
  for (const item of items)
    if (item.pr) byHead.set(key(item, item.pr.headBranch), item);
  const parentOf = (item: T) => {
    const parent = item.pr && byHead.get(key(item, item.pr.baseBranch));
    return parent && parent !== item ? parent : undefined;
  };
  const children = new Map<T, T[]>();
  for (const item of items) {
    const parent = parentOf(item);
    if (parent) children.set(parent, [...(children.get(parent) ?? []), item]);
  }
  const seen = new Set<T>();
  const descendants = (item: T): T[] =>
    (children.get(item) ?? []).flatMap((child) => {
      if (seen.has(child)) return [];
      seen.add(child);
      return [child, ...descendants(child)];
    });
  const rows: Stacked<T>[] = [];
  const emit = (root: T) => {
    seen.add(root);
    const stack = descendants(root);
    rows.push({ entry: root, depth: 0, last: false, size: stack.length });
    stack.forEach((entry, i) =>
      rows.push({ entry, depth: 1, last: i === stack.length - 1, size: 0 }),
    );
  };
  for (const item of items) if (!parentOf(item) && !seen.has(item)) emit(item);
  // Branch cycles have no root; surface them flat rather than dropping them.
  for (const item of items) if (!seen.has(item)) emit(item);
  return rows;
}
