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
      className={`@container/card relative px-3 py-2 transition-colors hover:bg-accent ${
        focused && !editing
          ? "outline-3 outline-blue-500 shadow-md shadow-blue-500/25"
          : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <PrStateIcon status={mergeStatus} loading={loading} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              className="block w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-medium outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
            />
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate"
              title={title}
            >
              <Text bold>{title}</Text>
            </a>
          )}
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground">
            {instanceId && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: getInstanceColor(instanceId) }}
                title={`Instance: ${instanceId}`}
              />
            )}
            <Text size="small" variant="secondary" className="shrink-0">
              {repo}
            </Text>
            <Text size="small" variant="tertiary" className="shrink-0">
              #{number}
            </Text>
            {author && (
              <Text size="small" variant="tertiary" className="shrink-0">
                @{author}
              </Text>
            )}
            {headBranch && (
              <span className="ml-2 flex min-w-0 items-center gap-1 overflow-hidden font-mono whitespace-nowrap">
                <GitBranch className="h-3 w-3 shrink-0" />
                <MiddleTruncate size="small" variant="secondary" max={45}>
                  {headBranch}
                </MiddleTruncate>
                {baseBranch &&
                  baseBranch !== "main" &&
                  baseBranch !== "master" && (
                    <span
                      className="flex shrink-0 items-center gap-1"
                      title={baseBranch}
                    >
                      <ArrowRight className="h-3 w-3" />
                      <Text size="small" variant="secondary">
                        {truncateMiddle(baseBranch, 30)}
                      </Text>
                    </span>
                  )}
              </span>
            )}
          </div>
        </div>
        {!merged && (
          <div className="hidden w-36 shrink-0 items-center gap-3 text-muted-foreground @2xl/card:flex">
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
            {commentCount > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                <Text size="small" variant="secondary">
                  {commentCount}
                </Text>
              </span>
            )}
          </div>
        )}
        <div className="flex w-60 shrink-0 flex-wrap items-center justify-end gap-1">
          {(() => {
            const ci = !merged && toCiStatus(ciStatus);
            return ci && <StatusBadge status={ci} />;
          })()}
          {!merged && conflict && (
            <Pill icon={TriangleAlert} tone="red">
              conflict
            </Pill>
          )}
          {!merged && autoMerge && (
            <Pill icon={Rocket} tone="green">
              auto-merge
            </Pill>
          )}
          {!merged &&
            unresolvedThreadCount != null &&
            unresolvedThreadCount > 0 && (
              <Pill icon={MessageSquareWarning} tone="amber">
                {unresolvedThreadCount}{" "}
                {unresolvedThreadCount === 1 ? "thread" : "threads"}
              </Pill>
            )}
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
        <div
          className="w-16 shrink-0 text-right"
          title={createdAt ? `created ${createdAt}` : undefined}
        >
          <TimeAgo date={updatedAt} className="text-[10px]" />
        </div>
      </div>
    </Card>
  );
}
