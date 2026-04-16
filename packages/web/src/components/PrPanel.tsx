import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { api } from "../api";
import { TimeAgo } from "./TimeAgo";

interface PanelPr {
	title: string;
	body: string;
	url: string;
	repo: string;
	number: number;
	additions: number;
	deletions: number;
	reviews: { approved: string[]; changesRequested: string[] };
	reviewDecision?: string | null;
	instanceId: string;
}

interface Props {
	pr: PanelPr;
	onClose: () => void;
}

type Tab = "overview" | "comments" | "files";
const tabs: { id: Tab; label: string }[] = [
	{ id: "overview", label: "Overview" },
	{ id: "comments", label: "Comments" },
	{ id: "files", label: "Files" },
];

export function PrPanel({ pr, onClose }: Props) {
	const [activeTab, setActiveTab] = useState<Tab>("overview");
	const scrollRef = useRef<HTMLDivElement>(null);

	const { data: meta, isLoading: metaLoading } = useQuery({
		queryKey: ["pr-meta", pr.instanceId, pr.repo, pr.number],
		queryFn: () => api.prMeta(pr.instanceId, pr.repo, pr.number),
	});

	const { data: comments, isLoading: commentsLoading } = useQuery({
		queryKey: ["pr-comments", pr.instanceId, pr.repo, pr.number],
		queryFn: () => api.prComments(pr.instanceId, pr.repo, pr.number),
		enabled: activeTab === "comments",
	});

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopImmediatePropagation();
				onClose();
			} else if (e.key === "l" || e.key === "ArrowRight") {
				e.preventDefault();
				setActiveTab((cur) => {
					const idx = tabs.findIndex((t) => t.id === cur);
					return tabs[(idx + 1) % tabs.length].id;
				});
			} else if (e.key === "h" || e.key === "ArrowLeft") {
				e.preventDefault();
				setActiveTab((cur) => {
					const idx = tabs.findIndex((t) => t.id === cur);
					return tabs[(idx - 1 + tabs.length) % tabs.length].id;
				});
			} else if (e.key === "j" || e.key === "ArrowDown") {
				e.preventDefault();
				scrollRef.current?.scrollBy({ top: 80 });
			} else if (e.key === "k" || e.key === "ArrowUp") {
				e.preventDefault();
				scrollRef.current?.scrollBy({ top: -80 });
			}
		};
		window.addEventListener("keydown", handler, { capture: true });
		return () => window.removeEventListener("keydown", handler, { capture: true });
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-40 flex">
			<div className="flex w-[40vw] shrink-0 flex-col border-r bg-background shadow-xl animate-in slide-in-from-left duration-200">
				{/* Header */}
				<div className="shrink-0 border-b bg-background px-5 py-3">
					<div className="flex items-center justify-between">
						<div className="min-w-0">
							<h2 className="text-sm font-semibold truncate">{pr.title}</h2>
							<p className="text-xs text-muted-foreground">{pr.repo}#{pr.number}</p>
						</div>
						<button
							onClick={onClose}
							className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
						>
							<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
								<path d="M18 6L6 18" />
								<path d="M6 6l12 12" />
							</svg>
						</button>
					</div>

					{/* Tabs */}
					<div className="mt-3 flex gap-1">
						{tabs.map((tab, _i) => (
							<button
								key={tab.id}
								onClick={() => setActiveTab(tab.id)}
								className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
									activeTab === tab.id
										? "bg-foreground text-background"
										: "text-muted-foreground hover:bg-muted"
								}`}
							>
								{tab.label}
							</button>
						))}
					</div>
				</div>

				{/* Content */}
				<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
					{activeTab === "overview" && (
						<OverviewTab pr={pr} meta={meta} isLoading={metaLoading} />
					)}
					{activeTab === "comments" && (
						<CommentsTab comments={comments} isLoading={commentsLoading} />
					)}
					{activeTab === "files" && (
						<FilesTab files={meta?.files} isLoading={metaLoading} />
					)}
				</div>
			</div>
			<div className="flex-1 bg-black/20 dark:bg-black/50" onClick={onClose} />
		</div>
	);
}

function OverviewTab({
	pr,
	meta,
	isLoading,
}: {
	pr: PanelPr;
	meta: Awaited<ReturnType<typeof api.prMeta>> | undefined;
	isLoading: boolean;
}) {
	return (
		<div className="space-y-5">
			{/* Reviews */}
			{(pr.reviews.approved.length > 0 || pr.reviews.changesRequested.length > 0 || pr.reviewDecision) && (
				<section>
					<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reviews</h3>
					<div className="space-y-1">
						{pr.reviews.approved.map((user) => (
							<div key={user} className="flex items-center gap-2 text-sm">
								<svg className="h-3.5 w-3.5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
									<path d="M20 6L9 17l-5-5" />
								</svg>
								<span>{user}</span>
							</div>
						))}
						{pr.reviews.changesRequested.map((user) => (
							<div key={user} className="flex items-center gap-2 text-sm">
								<svg className="h-3.5 w-3.5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
									<path d="M18 6L6 18" />
									<path d="M6 6l12 12" />
								</svg>
								<span>{user}</span>
							</div>
						))}
						{pr.reviews.approved.length > 0 && pr.reviewDecision === "REVIEW_REQUIRED" && (
							<div className="mt-2 flex items-center gap-2 rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
								<svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
									<path d="M12 9v4" />
									<path d="M12 17h.01" />
									<path d="M3.6 15.4 10.6 3.6a1.6 1.6 0 0 1 2.8 0l7 11.8A1.6 1.6 0 0 1 19 18H5a1.6 1.6 0 0 1-1.4-2.6Z" />
								</svg>
								<span>Code owner review still required</span>
							</div>
						)}
					</div>
				</section>
			)}

			{/* CI Checks */}
			<section>
				<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">CI Checks</h3>
				{isLoading ? (
					<p className="text-xs text-muted-foreground">Loading...</p>
				) : meta?.checks.length === 0 ? (
					<p className="text-xs text-muted-foreground">No checks</p>
				) : meta?.checks.every((c) => c.conclusion === "success") ? (
					<div className="flex items-center gap-2 text-sm text-green-600">
						<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
							<path d="M20 6L9 17l-5-5" />
						</svg>
						<span>All checks passing ({meta.checks.length})</span>
					</div>
				) : (
					<div className="space-y-1">
						{meta?.checks.map((check) => (
							<div key={check.name} className="flex items-center gap-2 text-sm">
								<CheckIcon conclusion={check.conclusion} status={check.status} />
								<span className="truncate">{check.name}</span>
							</div>
						))}
					</div>
				)}
			</section>

			{/* Description */}
			{pr.body && (
				<section>
					<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</h3>
					<div className="prose prose-sm max-w-none text-sm dark:prose-invert">
						<Markdown>{pr.body}</Markdown>
					</div>
				</section>
			)}
		</div>
	);
}

function CommentsTab({
	comments,
	isLoading,
}: {
	comments: Awaited<ReturnType<typeof api.prComments>> | undefined;
	isLoading: boolean;
}) {
	if (isLoading) {
		return <p className="text-sm text-muted-foreground">Loading comments...</p>;
	}

	if (!comments || comments.length === 0) {
		return <p className="text-sm text-muted-foreground">No comments</p>;
	}

	return (
		<div className="space-y-4">
			{comments.map((c) => (
				<div key={c.id} className="border-b pb-4 last:border-0">
					<div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
						<span className="font-medium text-foreground">{c.author}</span>
						<TimeAgo date={c.createdAt} />
						{c.path && (
							<span className="truncate font-mono text-[11px]">{c.path}</span>
						)}
					</div>
					<div className="prose prose-sm max-w-none text-sm dark:prose-invert">
						<Markdown>{c.body}</Markdown>
					</div>
				</div>
			))}
		</div>
	);
}

function FilesTab({
	files,
	isLoading,
}: {
	files: Awaited<ReturnType<typeof api.prMeta>>["files"] | undefined;
	isLoading: boolean;
}) {
	if (isLoading) {
		return <p className="text-sm text-muted-foreground">Loading files...</p>;
	}

	if (!files || files.length === 0) {
		return <p className="text-sm text-muted-foreground">No changed files</p>;
	}

	return (
		<div className="space-y-4">
			{files.map((f) => (
				<div key={f.filename}>
					<div className="flex items-center gap-2 text-xs">
						<span className="truncate font-mono font-medium">{f.filename}</span>
						<span className="shrink-0 text-green-600">+{f.additions}</span>
						<span className="shrink-0 text-red-600">-{f.deletions}</span>
					</div>
					{f.patch && (
						<pre className="mt-1 overflow-x-auto rounded bg-muted p-2 font-mono text-[11px] leading-relaxed">
							{f.patch.split("\n").map((line, i) => (
								<div
									key={i}
									className={
										line.startsWith("+")
											? "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/30"
											: line.startsWith("-")
												? "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/30"
												: line.startsWith("@@")
													? "text-blue-600 dark:text-blue-400"
													: ""
									}
								>
									{line}
								</div>
							))}
						</pre>
					)}
				</div>
			))}
		</div>
	);
}

function CheckIcon({ conclusion, status }: { conclusion: string | null; status: string }) {
	if (status === "in_progress" || status === "queued") {
		return (
			<svg className="h-3.5 w-3.5 animate-spin text-yellow-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
				<circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" />
			</svg>
		);
	}
	if (conclusion === "success") {
		return (
			<svg className="h-3.5 w-3.5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
				<path d="M20 6L9 17l-5-5" />
			</svg>
		);
	}
	if (conclusion === "failure") {
		return (
			<svg className="h-3.5 w-3.5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
				<path d="M18 6L6 18" />
				<path d="M6 6l12 12" />
			</svg>
		);
	}
	if (conclusion === "skipped" || conclusion === "neutral") {
		return <span className="h-3.5 w-3.5 text-center text-xs text-muted-foreground">–</span>;
	}
	return <span className="h-3.5 w-3.5" />;
}
