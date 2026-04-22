import { Card } from "@/components/ui/card";
import { getInstanceColor } from "../instance-colors";
import { ApprovedStamp } from "./ApprovedStamp";
import { CodeOwnerReviewBadge } from "./CodeOwnerReviewBadge";
import { PrStateIcon } from "./PrStateIcon";
import { ReviewBadge } from "./ReviewBadge";
import { StatusBadge } from "./StatusBadge";
import { useState, useRef, useEffect } from "react";
import {
  GitBranch,
  GitCommit,
  TriangleAlert,
  Zap,
  Target,
  MessageSquare,
} from "lucide-react";
import { truncateBranchName } from "../utils/branch";

interface Props {
  title: string;
  url: string;
  repo: string;
  number: number;
  updatedAt: string;
  draft: boolean;
  merged?: boolean;
  ciStatus: string;
  inMergeQueue?: boolean;
  autoMerge?: boolean;
  headBranch?: string;
  baseBranch?: string;
  reviews: { approved: string[]; changesRequested: string[] };
  reviewDecision?: string | null;
  additions: number;
  deletions: number;
  commits: number;
  commentCount: number;
  focused: boolean;
  togglingDraft?: boolean;
  instanceId?: string;
  instanceLabel?: string;
  author?: string;
  authorAvatar?: string;
  editing?: boolean;
  onSaveTitle?: (title: string) => void;
  mergeable?: boolean | null;
}

export function PrCard({
  title,
  url,
  repo,
  number,
  updatedAt: _updatedAt,
  draft,
  merged,
  ciStatus,
  inMergeQueue,
  autoMerge,
  headBranch,
  baseBranch,
  reviews,
  reviewDecision,
  additions,
  deletions,
  commits,
  commentCount,
  focused,
  togglingDraft,
  instanceId,
  instanceLabel: _instanceLabel,
  author,
  authorAvatar: _authorAvatar,
  editing,
  onSaveTitle,
  mergeable,
}: Props) {
  const [editTitle, setEditTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditTitle(title);
  }, [title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function handleSave() {
    if (editTitle.trim() && editTitle !== title) {
      onSaveTitle?.(editTitle);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditTitle(title);
      onSaveTitle?.("");
    }
  }

  return (
    <Card
      className={`@container/card relative px-4 py-3.5 transition-colors hover:bg-accent ${
        focused ? "outline-3 outline-blue-500 shadow-md shadow-blue-500/25" : ""
      }`}
      style={
        instanceId
          ? { borderLeft: `4px solid ${getInstanceColor(instanceId)}` }
          : undefined
      }
    >
      <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1">
        {(reviewDecision === "APPROVED" ||
          reviewDecision === "REVIEW_REQUIRED" ||
          (reviewDecision == null && reviews.approved.length > 0)) &&
          reviews.approved.length > 0 && <ApprovedStamp />}
        {reviews.approved.length > 0 &&
          reviewDecision === "REVIEW_REQUIRED" && <CodeOwnerReviewBadge />}
        {(reviewDecision === "CHANGES_REQUESTED" ||
          (reviewDecision == null &&
            reviews.changesRequested.length > 0 &&
            reviews.approved.length === 0)) && (
          <ReviewBadge reviews={reviews} />
        )}
      </div>
      <div className="flex">
        <div className="flex shrink-0 flex-col items-center justify-center gap-2 pr-4">
          <span className="text-[10px] text-muted-foreground/70">{number}</span>
          <PrStateIcon
            draft={draft}
            merged={merged}
            loading={togglingDraft}
            inMergeQueue={inMergeQueue}
          />
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
            <span className="shrink-0">{repo}</span>
            {author && (
              <span className="text-muted-foreground/50">@{author}</span>
            )}
            <span className="flex-1" />
            {headBranch && (
              <span className="flex items-center gap-1 font-mono text-[10px] whitespace-nowrap">
                <GitBranch className="h-3 w-3" />
                {truncateBranchName(headBranch)}
                {baseBranch &&
                  baseBranch !== "main" &&
                  baseBranch !== "master" && (
                    <span className="ml-0.5 flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <Target className="h-3 w-3" />
                      {baseBranch}
                    </span>
                  )}
              </span>
            )}
          </div>
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              className="mt-1 w-full rounded border border-input bg-background px-2 py-1 text-sm font-medium"
            />
          ) : (
            <a href={url} target="_blank" rel="noopener noreferrer">
              <p className="mt-1 text-sm font-medium">{title}</p>
            </a>
          )}
          <div className="mt-1.5 flex flex-col gap-1.5 text-xs text-muted-foreground">
            {!merged && (
              <div
                className={`flex items-center gap-2 ${ciStatus === "unknown" ? "justify-start" : ""}`}
              >
                {ciStatus !== "unknown" && <StatusBadge status={ciStatus} />}
                <span className="font-mono">
                  <span className="text-green-600">+{additions}</span>
                  <span>/</span>
                  <span className="text-red-600">-{deletions}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <GitCommit className="h-3 w-3" />
                  {commits}
                </span>
                {commentCount > 0 && (
                  <span className="ml-1 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {commentCount}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              {autoMerge && (
                <span className="flex items-center gap-1 rounded bg-green-100 px-1 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <Zap className="h-3 w-3" />
                  auto-merge
                </span>
              )}
              {mergeable === false && (
                <span className="flex items-center gap-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <TriangleAlert className="h-3 w-3" />
                  conflict
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
