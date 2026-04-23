import { Loader2, GitMerge, GitPullRequest, CircleX } from "lucide-react";

export type MergeStatus =
  | "draft"
  | "ready"
  | "merge-queue"
  | "merged"
  | "closed";

export function toMergeStatus(pr: {
  draft: boolean;
  merged?: boolean;
  inMergeQueue?: boolean;
}): MergeStatus {
  if (pr.merged === true) return "merged";
  if (pr.merged === false) return "closed";
  if (pr.inMergeQueue) return "merge-queue";
  if (pr.draft) return "draft";
  return "ready";
}

export function PrStateIcon({
  status,
  loading,
}: {
  status: MergeStatus;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
    );
  }

  switch (status) {
    case "merge-queue":
      return <GitMerge className="h-4 w-4 shrink-0 text-amber-500" />;
    case "merged":
      return <GitPullRequest className="h-4 w-4 shrink-0 text-purple-500" />;
    case "closed":
      return <CircleX className="h-4 w-4 shrink-0 text-red-500" />;
    case "draft":
      return (
        <svg
          className="h-4 w-4 shrink-0 text-gray-400"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.75.75 0 1 1 1.06 1.06l-.97.97.97.97a.75.75 0 0 1-1.06 1.06l-.97-.97-.97.97a.75.75 0 1 1-1.06-1.06l.97-.97-.97-.97a.75.75 0 0 1 0-1.06Z" />
        </svg>
      );
    case "ready":
      return <GitPullRequest className="h-4 w-4 shrink-0 text-green-600" />;
  }
}
