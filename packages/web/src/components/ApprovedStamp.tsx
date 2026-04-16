import { ThumbsUp } from "lucide-react";

export function ApprovedStamp() {
	return (
		<div className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 dark:bg-green-900/30">
			<ThumbsUp className="h-3 w-3 text-green-700 dark:text-green-400" />
			<span className="text-[10px] font-medium text-green-700 dark:text-green-400">Approved</span>
		</div>
	);
}
