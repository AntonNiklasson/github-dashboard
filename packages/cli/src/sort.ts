import type { NormalizedPr, Notification, SyncKind } from "sync";

// Fields per tab, in menu order. Mirrors the web UI (packages/web/src/sort.ts)
// ("title" is "name" here) plus a CLI-only status sort.
export const sortFields = {
  prs: ["created", "updated", "name", "status", "size"],
  reviews: ["created", "updated", "name", "status", "author"],
  notifications: ["updated", "name", "repo"],
} as const satisfies Record<SyncKind, readonly string[]>;
export type SortField = (typeof sortFields)[SyncKind][number];
export type SortState = { field: SortField; dir: "asc" | "desc" };

// Second key after `s`, vim-leader style.
export const sortKeys: Record<SortField, string> = {
  created: "c",
  updated: "u",
  name: "n",
  status: "s",
  size: "z",
  author: "a",
  repo: "r",
};

export const defaultSort: Record<SyncKind, SortState> = {
  prs: { field: "created", dir: "desc" },
  reviews: { field: "updated", dir: "desc" },
  notifications: { field: "updated", dir: "desc" },
};

// Text fields read naturally A→Z; dates, status and size newest/most first.
const ascending = new Set<SortField>(["name", "repo", "author"]);

// Picking the active field again flips direction.
export function pickSort(
  kind: SyncKind,
  sort: SortState,
  key: string,
): SortState | null {
  const fields: readonly SortField[] = sortFields[kind];
  const field = fields.find((candidate) => sortKeys[candidate] === key);
  if (!field) return null;
  if (field !== sort.field)
    return { field, dir: ascending.has(field) ? "asc" : "desc" };
  return { field, dir: sort.dir === "asc" ? "desc" : "asc" };
}

type Sortable = {
  title: string;
  repo: string;
  pr?: NormalizedPr;
  notification?: Notification;
};

function time(iso: string | undefined): number {
  const value = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(value) ? 0 : value;
}

// Higher is more in need of attention, so the default desc order puts
// blocked PRs first and drafts last.
function statusRank(pr: NormalizedPr | undefined): number {
  if (!pr || pr.draft) return 0;
  if (pr.mergeStateStatus === "DIRTY" || pr.mergeable === false) return 5;
  if (pr.reviewDecision === "CHANGES_REQUESTED") return 4;
  if (pr.reviewDecision === "REVIEW_REQUIRED") return 3;
  if (pr.reviewDecision === "APPROVED") return 2;
  return 1;
}

export function compare(a: Sortable, b: Sortable, sort: SortState): number {
  const sign = sort.dir === "asc" ? 1 : -1;
  switch (sort.field) {
    case "created":
      return sign * (time(a.pr?.createdAt) - time(b.pr?.createdAt));
    case "updated":
      return (
        sign *
        (time(a.pr?.updatedAt ?? a.notification?.updatedAt) -
          time(b.pr?.updatedAt ?? b.notification?.updatedAt))
      );
    case "name":
      return sign * a.title.localeCompare(b.title);
    case "status":
      return sign * (statusRank(a.pr) - statusRank(b.pr));
    case "repo":
      return sign * a.repo.localeCompare(b.repo);
    case "author":
      return sign * (a.pr?.author ?? "").localeCompare(b.pr?.author ?? "");
    case "size": {
      const size = (item: Sortable) =>
        (item.pr?.additions ?? 0) + (item.pr?.deletions ?? 0);
      return sign * (size(a) - size(b));
    }
  }
}
