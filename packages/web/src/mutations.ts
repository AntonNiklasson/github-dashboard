import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./api";
import type { Notification, PR, ReviewRequest } from "./types";

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
    toast.error(
      err instanceof Error ? err.message : "Failed to toggle auto-merge",
    );
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
