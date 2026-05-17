import { atomWithStorage } from "jotai/utils";
import type { Notification, PR, ReviewRequest } from "./types";

export type SortDir = "asc" | "desc";

export interface SortState<F extends string> {
  field: F;
  dir: SortDir;
}

export interface SortFieldOption<F extends string> {
  field: F;
  label: string;
}

export const PR_SORT_FIELDS = [
  { field: "created", label: "created" },
  { field: "updated", label: "updated" },
  { field: "title", label: "title" },
  { field: "size", label: "size" },
] as const satisfies readonly SortFieldOption<string>[];
export type PrSortField = (typeof PR_SORT_FIELDS)[number]["field"];

export const REVIEW_SORT_FIELDS = [
  { field: "created", label: "created" },
  { field: "updated", label: "updated" },
  { field: "title", label: "title" },
  { field: "author", label: "author" },
] as const satisfies readonly SortFieldOption<string>[];
export type ReviewSortField = (typeof REVIEW_SORT_FIELDS)[number]["field"];

export const NOTIFICATION_SORT_FIELDS = [
  { field: "updated", label: "updated" },
  { field: "title", label: "title" },
  { field: "repo", label: "repo" },
] as const satisfies readonly SortFieldOption<string>[];
export type NotificationSortField =
  (typeof NOTIFICATION_SORT_FIELDS)[number]["field"];

export const prSortAtom = atomWithStorage<SortState<PrSortField>>("prSort", {
  field: "created",
  dir: "desc",
});

export const reviewSortAtom = atomWithStorage<SortState<ReviewSortField>>(
  "reviewSort",
  { field: "updated", dir: "desc" },
);

export const notificationSortAtom = atomWithStorage<
  SortState<NotificationSortField>
>("notificationSort", { field: "updated", dir: "desc" });

function cmpDate(a?: string, b?: string) {
  const aT = a ? new Date(a).getTime() : 0;
  const bT = b ? new Date(b).getTime() : 0;
  return aT - bT;
}

function cmpString(a: string, b: string) {
  return a.localeCompare(b);
}

export function comparePrs(a: PR, b: PR, sort: SortState<PrSortField>) {
  const sign = sort.dir === "asc" ? 1 : -1;
  switch (sort.field) {
    case "created":
      return sign * cmpDate(a.createdAt, b.createdAt);
    case "updated":
      return sign * cmpDate(a.updatedAt, b.updatedAt);
    case "title":
      return sign * cmpString(a.title, b.title);
    case "size":
      return sign * (a.additions + a.deletions - (b.additions + b.deletions));
  }
  return 0;
}

export function compareReviews(
  a: ReviewRequest,
  b: ReviewRequest,
  sort: SortState<ReviewSortField>,
) {
  const sign = sort.dir === "asc" ? 1 : -1;
  switch (sort.field) {
    case "created":
      return sign * cmpDate(a.createdAt, b.createdAt);
    case "updated":
      return sign * cmpDate(a.updatedAt, b.updatedAt);
    case "title":
      return sign * cmpString(a.title, b.title);
    case "author":
      return sign * cmpString(a.author, b.author);
  }
  return 0;
}

export function compareNotifications(
  a: Notification,
  b: Notification,
  sort: SortState<NotificationSortField>,
) {
  const sign = sort.dir === "asc" ? 1 : -1;
  switch (sort.field) {
    case "updated":
      return sign * cmpDate(a.updatedAt, b.updatedAt);
    case "title":
      return sign * cmpString(a.title, b.title);
    case "repo":
      return sign * cmpString(a.repo, b.repo);
  }
  return 0;
}
