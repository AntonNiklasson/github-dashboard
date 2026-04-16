import { MessageSquareWarning } from "lucide-react";

interface Props {
	reviews: { approved: string[]; changesRequested: string[] };
}

export function ReviewBadge({ reviews }: Props) {
	const { changesRequested } = reviews;

	if (changesRequested.length === 0) {
		return null;
	}

	return (
		<div className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 dark:bg-red-900/30">
			<MessageSquareWarning className="h-3 w-3 text-red-700 dark:text-red-400" />
			<span className="text-[10px] font-medium text-red-700 dark:text-red-400">Changes requested</span>
		</div>
	);
}
