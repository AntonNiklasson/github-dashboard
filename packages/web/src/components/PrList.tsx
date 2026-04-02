import { getInstanceColor } from "../instance-colors";
import type { PR, RecentPR } from "../types";
import { FocusLi } from "./FocusLi";
import { PrCard } from "./PrCard";
import { TimeAgo } from "./TimeAgo";
import { GitMerge, XCircle } from "lucide-react";

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
								{...pr}
								focused={focused}
								togglingDraft={pr.id === togglingDraftId}
								editing={editingPrNumber === pr.number}
								onSaveTitle={(title) => onSaveTitle?.(pr.number, title)}
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
					<ul className="space-y-1.5">
						{recentPrs.map((pr, i) => {
							const focused = isFocusedSection && focusIndex === recentOffset + i;
							return (
								<FocusLi key={pr.id} focused={focused}>
									<a href={pr.url} target="_blank" rel="noopener noreferrer"
										className={`block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
											focused ? "outline-3 outline-blue-500 shadow-md shadow-blue-500/25" : ""
										}`}
										style={pr.instanceId ? { borderLeft: `4px solid ${getInstanceColor(pr.instanceId)}` } : undefined}
									>
									<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
											<span>{pr.repo}#{pr.number}</span>
											{pr.merged ? (
												<GitMerge className="h-3.5 w-3.5 text-purple-500" />
											) : (
												<XCircle className="h-3.5 w-3.5 text-red-500" />
											)}
										</div>
										<p className="mt-0.5 truncate">{pr.title}</p>
										<div className="mt-0.5">
											<TimeAgo date={pr.updatedAt} />
										</div>
									</a>
								</FocusLi>
							);
						})}
					</ul>
				</>
			)}
		</div>
	);
}
