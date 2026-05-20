import type { PR } from "../types";
import { FocusLi } from "./FocusLi";
import { PrCard } from "./PrCard";
import { toMergeStatus } from "./PrStateIcon";
import { Text } from "./Text";

interface Props {
  prs: PR[];
  focusIndex: number;
  isFocusedSection: boolean;
  togglingDraftId?: number;
  editingPrNumber?: number;
  onSaveTitle?: (prNumber: number, title: string) => void;
}

export function PrList({
  prs,
  focusIndex,
  isFocusedSection,
  togglingDraftId,
  editingPrNumber,
  onSaveTitle,
}: Props) {
  if (prs.length === 0) {
    return (
      <p className="py-4 text-center text-muted-foreground">
        <Text>No open PRs</Text>
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {prs.map((pr, i) => {
        const focused = isFocusedSection && focusIndex === i;
        return (
          <FocusLi key={pr.id} focused={focused}>
            <PrCard
              title={pr.title}
              url={pr.url}
              repo={pr.repo}
              number={pr.number}
              createdAt={pr.createdAt}
              updatedAt={pr.updatedAt}
              author={pr.author}
              authorAvatar={pr.authorAvatar}
              mergeStatus={toMergeStatus(pr)}
              loading={togglingDraftId === pr.id}
              ciStatus={pr.ciStatus}
              autoMerge={pr.autoMerge}
              headBranch={pr.headBranch}
              baseBranch={pr.baseBranch}
              reviews={pr.reviews}
              reviewDecision={pr.reviewDecision}
              additions={pr.additions}
              deletions={pr.deletions}
              commits={pr.commits}
              commentCount={pr.commentCount}
              conflict={pr.mergeable === false}
              unresolvedThreadCount={pr.unresolvedThreadCount}
              focused={focused}
              instanceId={pr.instanceId}
              instanceLabel={pr.instanceLabel}
              editing={editingPrNumber === pr.number}
              onSaveTitle={(title) => onSaveTitle?.(pr.number, title)}
            />
          </FocusLi>
        );
      })}
    </ul>
  );
}
