import { Card } from "@/components/ui/card";
import { getInstanceColor } from "../instance-colors";
import { PrStateIcon } from "./PrStateIcon";
import { StatusBadge, toCiStatus } from "./StatusBadge";
import { useState, useRef, useEffect } from "react";
import {
  ArrowRight,
  GitBranch,
  GitCommit,
  MessageSquare,
  MessageSquareWarning,
  Rocket,
  TriangleAlert,
} from "lucide-react";
import { MiddleTruncate } from "./MiddleTruncate";
import { Pill } from "./Pill";
import type { MergeStatus } from "./PrStateIcon";
import { ReviewStamp } from "./ReviewStamp";
import { Text } from "./Text";
import { TimeAgo } from "./TimeAgo";
import { truncateMiddle } from "../utils/truncate";

interface Props {
  title: string;
  url: string;
  repo: string;
  number: number;
  createdAt?: string;
  updatedAt: string;
  mergeStatus: MergeStatus;
  ciStatus: string;
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
  loading?: boolean;
  instanceId?: string;
  instanceLabel?: string;
  author?: string;
  authorAvatar?: string;
  editing?: boolean;
  onSaveTitle?: (title: string) => void;
  conflict?: boolean;
  unresolvedThreadCount?: number;
}

export function PrCard({
  title,
  url,
  repo,
  number,
  createdAt,
  updatedAt,
  mergeStatus,
  ciStatus,
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
  loading,
  instanceId,
  instanceLabel: _instanceLabel,
  author,
  authorAvatar: _authorAvatar,
  editing,
  onSaveTitle,
  conflict,
  unresolvedThreadCount,
}: Props) {
  const merged = mergeStatus === "merged";
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
        focused && !editing
          ? "outline-3 outline-blue-500 shadow-md shadow-blue-500/25"
          : ""
      }`}
    >
      <div className="flex">
        <div className="flex shrink-0 items-center justify-center pr-4">
          <PrStateIcon status={mergeStatus} loading={loading} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {instanceId && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: getInstanceColor(instanceId) }}
                title={`Instance: ${instanceId}`}
              />
            )}
            <Text size="small" variant="secondary" className="truncate">
              {repo}
            </Text>
            <Text size="small" variant="tertiary" className="shrink-0">
              #{number}
            </Text>
            {author && (
              <Text size="small" variant="tertiary" className="ml-1 truncate">
                @{author}
              </Text>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {reviews.approved.length > 0 && (
                <ReviewStamp kind="approved" count={reviews.approved.length} />
              )}
              {reviews.changesRequested.length > 0 && (
                <ReviewStamp
                  kind="changes-requested"
                  count={reviews.changesRequested.length}
                />
              )}
              {reviewDecision === "REVIEW_REQUIRED" &&
                reviews.approved.length > 0 && (
                  <ReviewStamp kind="missing-code-owner" />
                )}
            </div>
          </div>
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
            />
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block"
            >
              <Text bold>{title}</Text>
            </a>
          )}
          {headBranch && (
            <div className="mt-1 flex items-center gap-1.5 font-mono text-muted-foreground">
              <GitBranch className="h-3 w-3 shrink-0" />
              <MiddleTruncate size="small" variant="secondary" max={45}>
                {headBranch}
              </MiddleTruncate>
              {baseBranch &&
                baseBranch !== "main" &&
                baseBranch !== "master" && (
                  <Pill icon={ArrowRight} tone="muted">
                    <span title={baseBranch}>
                      {truncateMiddle(baseBranch, 45)}
                    </span>
                  </Pill>
                )}
            </div>
          )}
          {!merged && (
            <div className="mt-1.5 flex flex-wrap items-center gap-4 text-muted-foreground">
              {conflict && (
                <Pill icon={TriangleAlert} tone="red">
                  conflict
                </Pill>
              )}
              <span className="flex items-center gap-0.5 font-mono">
                <Text size="small" className="text-green-600">
                  +{additions}
                </Text>
                <Text size="small">/</Text>
                <Text size="small" className="text-red-600">
                  -{deletions}
                </Text>
              </span>
              <span className="flex items-center gap-1">
                <GitCommit className="h-3 w-3" />
                <Text size="small" variant="secondary">
                  {commits}
                </Text>
              </span>
              {(commentCount > 0 ||
                (unresolvedThreadCount != null &&
                  unresolvedThreadCount > 0)) && (
                <span className="flex items-center gap-2">
                  {commentCount > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      <Text size="small" variant="secondary">
                        {commentCount}
                      </Text>
                    </span>
                  )}
                  {unresolvedThreadCount != null &&
                    unresolvedThreadCount > 0 && (
                      <Pill icon={MessageSquareWarning} tone="amber">
                        {unresolvedThreadCount} open{" "}
                        {unresolvedThreadCount === 1 ? "thread" : "threads"}
                      </Pill>
                    )}
                </span>
              )}
            </div>
          )}
          {(() => {
            const ci = !merged && toCiStatus(ciStatus);
            return (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {ci && <StatusBadge status={ci} />}
                {!merged && autoMerge && (
                  <Pill icon={Rocket} tone="green">
                    auto-merge
                  </Pill>
                )}
                <div className="ml-auto flex items-center gap-3 text-muted-foreground">
                  {createdAt && (
                    <span className="flex items-center gap-1">
                      <Text
                        size="small"
                        variant="tertiary"
                        className="text-[10px]"
                      >
                        opened
                      </Text>
                      <TimeAgo date={createdAt} className="text-[10px]" />
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Text
                      size="small"
                      variant="tertiary"
                      className="text-[10px]"
                    >
                      updated
                    </Text>
                    <TimeAgo date={updatedAt} className="text-[10px]" />
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </Card>
  );
}
