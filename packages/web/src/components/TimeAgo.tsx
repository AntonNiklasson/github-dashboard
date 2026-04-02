function timeAgo(date: string): string {
	const seconds = Math.floor(
		(Date.now() - new Date(date).getTime()) / 1000,
	);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function TimeAgo({ date }: { date: string }) {
	return (
		<span className="text-xs text-gray-500" title={date}>
			{timeAgo(date)}
		</span>
	);
}
