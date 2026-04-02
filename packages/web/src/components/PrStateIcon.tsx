import { Loader2, GitMerge, GitPullRequest } from "lucide-react";

export function PrStateIcon({ draft, loading, inMergeQueue }: { draft: boolean; loading?: boolean; inMergeQueue?: boolean }) {
	if (loading) {
		return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />;
	}

	if (inMergeQueue) {
		return <GitMerge className="h-4 w-4 shrink-0 text-amber-500" />;
	}

	if (draft) {
		return (
			<svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 16 16" fill="currentColor">
				<path d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.75.75 0 1 1 1.06 1.06l-.97.97.97.97a.75.75 0 0 1-1.06 1.06l-.97-.97-.97.97a.75.75 0 1 1-1.06-1.06l.97-.97-.97-.97a.75.75 0 0 1 0-1.06Z" />
			</svg>
		);
	}

	return <GitPullRequest className="h-4 w-4 shrink-0 text-green-600" />;
}
