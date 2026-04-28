import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./api";
import type { Notification, PR, RecentPR, ReviewRequest } from "./types";

interface Target {
  instanceId: string;
  repo: string;
  number: number;
}

type Snapshot<T> = [readonly unknown[], T | undefined][];

function snapshot<T>(qc: QueryClient, key: string): Snapshot<T> {
  return qc.getQueriesData<T>({ queryKey: [key] });
}

function restore<T>(qc: QueryClient, snap: Snapshot<T>) {
  for (const [key, data] of snap) {
    qc.setQueryData(key, data);
  }
}

const matches =
  (target: Target) =>
  (item: { repo: string; number: number }): boolean =>
    item.number === target.number && item.repo === target.repo;

export async function approvePr(
  qc: QueryClient,
  target: Target,
): Promise<void> {
  // Approve removes the PR from MY review-requests list (no longer awaiting me).
  const snap = snapshot<ReviewRequest[]>(qc, "reviews");
  qc.setQueriesData<ReviewRequest[]>({ queryKey: ["reviews"] }, (old) =>
    old?.filter((r) => !matches(target)(r)),
  );
  try {
    await api.approvePr(target.instanceId, target.repo, target.number);
    toast.success("PR approved");
  } catch (err) {
    restore(qc, snap);
    toast.error("Failed to approve PR");
    throw err;
  }
}

export async function toggleAutoMerge(
  qc: QueryClient,
  target: Target,
  current: boolean,
): Promise<void> {
  const snap = snapshot<PR[]>(qc, "prs");
  qc.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
    old?.map((pr) =>
      matches(target)(pr) ? { ...pr, autoMerge: !current } : pr,
    ),
  );
  try {
    await api.toggleAutoMerge(target.instanceId, target.repo, target.number);
  } catch (err) {
    restore(qc, snap);
    toast.error("Failed to toggle auto-merge");
    throw err;
  }
}

export async function closePr(
  qc: QueryClient,
  target: Target & { title: string; url: string },
): Promise<void> {
  const prsSnap = snapshot<PR[]>(qc, "prs");
  const reviewsSnap = snapshot<ReviewRequest[]>(qc, "reviews");
  const recentSnap = snapshot<RecentPR[]>(qc, "recent-prs");

  qc.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
    old?.filter((pr) => !matches(target)(pr)),
  );
  qc.setQueriesData<ReviewRequest[]>({ queryKey: ["reviews"] }, (old) =>
    old?.filter((r) => !matches(target)(r)),
  );
  qc.setQueriesData<RecentPR[]>({ queryKey: ["recent-prs"] }, (old) => [
    {
      id: Date.now(),
      number: target.number,
      title: target.title,
      url: target.url,
      repo: target.repo,
      updatedAt: new Date().toISOString(),
      merged: false,
    },
    ...(old ?? []),
  ]);

  try {
    await api.closePr(target.instanceId, target.repo, target.number);
    toast.success("PR closed");
  } catch (err) {
    restore(qc, prsSnap);
    restore(qc, reviewsSnap);
    restore(qc, recentSnap);
    toast.error("Failed to close PR");
    throw err;
  }
}

export async function toggleDraft(
  qc: QueryClient,
  target: Target,
  current: boolean,
): Promise<void> {
  const snap = snapshot<PR[]>(qc, "prs");
  qc.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
    old?.map((pr) => (matches(target)(pr) ? { ...pr, draft: !current } : pr)),
  );
  toast(current ? "Marked as ready for review" : "Marked as draft");
  try {
    await api.toggleDraft(target.instanceId, target.repo, target.number);
  } catch (err) {
    restore(qc, snap);
    toast.error("Failed to toggle draft");
    throw err;
  }
}

export async function dismissNotification(
  qc: QueryClient,
  target: { instanceId: string; notificationId: string },
): Promise<void> {
  const snap = snapshot<Notification[]>(qc, "notifications");
  qc.setQueriesData<Notification[]>({ queryKey: ["notifications"] }, (old) =>
    old?.filter((n) => n.id !== target.notificationId),
  );
  try {
    await api.dismissNotification(target.instanceId, target.notificationId);
  } catch (err) {
    restore(qc, snap);
    toast.error("Failed to dismiss notification");
    throw err;
  }
}

export async function updatePrTitle(
  qc: QueryClient,
  target: Target,
  title: string,
): Promise<void> {
  const snap = snapshot<PR[]>(qc, "prs");
  qc.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
    old?.map((pr) => (matches(target)(pr) ? { ...pr, title } : pr)),
  );
  try {
    await api.updatePrTitle(
      target.instanceId,
      target.repo,
      target.number,
      title,
    );
  } catch (err) {
    restore(qc, snap);
    toast.error("Failed to update title");
    throw err;
  }
}

export async function rerunCi(qc: QueryClient, target: Target): Promise<void> {
  const snap = snapshot<PR[]>(qc, "prs");
  qc.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
    old?.map((pr) =>
      matches(target)(pr) ? { ...pr, ciStatus: "pending" } : pr,
    ),
  );
  try {
    await api.rerunCi(target.instanceId, target.repo, target.number);
    toast.success("CI rerun started");
  } catch (err) {
    restore(qc, snap);
    toast.error("Failed to rerun CI");
    throw err;
  }
}
