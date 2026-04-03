import { useMemo } from "react";
import { useLinearIssues, useLinearStatus } from "../hooks";
import type { PR, RecentPR } from "../types";
import { FocusLi } from "./FocusLi";
import { PrCard } from "./PrCard";

interface Props {
	prs: PR[];
	focusIndex: number;
	isFocusedSection: boolean;
	togglingDraftId?: number;
	recentPrs?: RecentPR[];
	editingPrNumber?: number;
	onSaveTitle?: (prNumber: number, title: string) => void;
}

export function PrList({ prs, focusIndex, isFocusedSection, togglingDraftId, recentPrs, editingPrNumber, onSaveTitle }: Props) {
	// Collect all branch names for Linear issue resolution
	const { data: linearStatus } = useLinearStatus();
	const branches = useMemo(() => {
		const all: string[] = [];
		for (const pr of prs) {
			if (pr.headBranch) all.push(pr.headBranch);
		}
		if (recentPrs) {
			for (const pr of recentPrs) {
				if (pr.headBranch) all.push(pr.headBranch);
			}
		}
		return all;
	}, [prs, recentPrs]);

	const { data: linearIssueMap } = useLinearIssues(
		linearStatus?.configured ? branches : [],
	);

	if (prs.length === 0 && (!recentPrs || recentPrs.length === 0)) {
		return <p className="py-4 text-center text-sm text-muted-foreground">No open PRs</p>;
	}

	const recentOffset = prs.length;

	return (
		<div>
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
								updatedAt={pr.updatedAt}
								author={pr.author}
								authorAvatar={pr.authorAvatar}
								draft={pr.draft}
								merged={pr.merged}
								ciStatus={pr.ciStatus}
								inMergeQueue={pr.inMergeQueue}
								autoMerge={pr.autoMerge}
								headBranch={pr.headBranch}
								baseBranch={pr.baseBranch}
								reviews={pr.reviews}
								additions={pr.additions}
								deletions={pr.deletions}
								commits={pr.commits}
								commentCount={pr.commentCount}
								mergeable={pr.mergeable}
								focused={focused}
								instanceId={pr.instanceId}
								instanceLabel={pr.instanceLabel}
								linearIssues={pr.headBranch ? linearIssueMap?.[pr.headBranch] : undefined}
							/>
						</FocusLi>
					);
				})}
			</ul>

			{recentPrs && recentPrs.length > 0 && (
				<>
					<div className="my-3 flex items-center gap-2 text-xs text-muted-foreground">
						<div className="h-px flex-1 bg-border" />
						<span>Last 7 days</span>
						<div className="h-px flex-1 bg-border" />
					</div>
					<ul className="space-y-2">
						{recentPrs.map((pr, i) => {
							const focused = isFocusedSection && focusIndex === recentOffset + i;
							return (
								<FocusLi key={pr.id} focused={focused}>
									<PrCard
										title={pr.title}
										url={pr.url}
										repo={pr.repo}
										number={pr.number}
										updatedAt={pr.updatedAt}
										draft={false}
										merged={pr.merged}
										ciStatus="unknown"
										inMergeQueue={false}
										autoMerge={false}
										headBranch={pr.headBranch ?? ""}
										baseBranch=""
										reviews={{ approved: [], changesRequested: [] }}
										additions={pr.additions ?? 0}
										deletions={pr.deletions ?? 0}
										commits={pr.commits ?? 0}
										commentCount={0}
										focused={focused}
										instanceId={pr.instanceId}
										instanceLabel={pr.instanceLabel}
										linearIssues={pr.headBranch ? linearIssueMap?.[pr.headBranch] : undefined}
									/>
								</FocusLi>
							);
						})}
					</ul>
				</>
			)}
		</div>
	);
}
