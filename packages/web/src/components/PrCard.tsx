import { Card } from "@/components/ui/card";
import { getInstanceColor } from "../instance-colors";
import { ApprovedStamp } from "./ApprovedStamp";
import { PrStateIcon } from "./PrStateIcon";
import { ReviewBadge } from "./ReviewBadge";
import { StatusBadge } from "./StatusBadge";
import { useState, useRef, useEffect } from "react";
import { GitBranch, GitCommit, AlertCircle, Zap } from "lucide-react";
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
	additions,
	deletions,
	commits,
	commentCount: _commentCount,
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
			style={instanceId ? { borderLeft: `4px solid ${getInstanceColor(instanceId)}` } : undefined}
		>
			{reviews.approved.length > 0 && <ApprovedStamp />}
			{reviews.changesRequested.length > 0 && reviews.approved.length === 0 && <ReviewBadge reviews={reviews} />}
			<div className="flex">
				<div className="flex shrink-0 items-center pr-4">
					<PrStateIcon draft={draft} merged={merged} loading={togglingDraft} inMergeQueue={inMergeQueue} />
				</div>
				<div className="min-w-0 flex-1 overflow-hidden">
					<div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
						<span className="shrink-0"><span className="hidden @lg:block">{repo.split("/")[0]}/</span>{repo.split("/")[1]}#{number}</span>
						<span className="flex-1" />
						{author && <span className="text-muted-foreground/50">@{author}</span>}
						{headBranch && (
							<>
								<span className="ml-0.5" />
								<span className="flex items-center gap-1 font-mono text-[10px] whitespace-nowrap">
									<GitBranch className="h-3 w-3" />
									{truncateBranchName(headBranch)}
								</span>
							</>
						)}
					</div>
					<div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
						{baseBranch && baseBranch !== "main" && baseBranch !== "master" && (
							<span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">→ {baseBranch}</span>
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
						<div className="flex items-center gap-2">
							<StatusBadge status={ciStatus} />
							<span className="font-mono">
								<span className="text-green-600">+{additions}</span>
								<span>/</span>
								<span className="text-red-600">-{deletions}</span>
							</span>
							<span className="flex items-center gap-0.5">
								<GitCommit className="h-3.5 w-3.5" />
								{commits}
							</span>
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
								<span className="flex items-center gap-1 rounded bg-red-100 px-1 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
									<AlertCircle className="h-3 w-3" />
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
