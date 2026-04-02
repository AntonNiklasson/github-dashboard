interface Props {
	reviews: { approved: string[]; changesRequested: string[] };
}

export function ReviewBadge({ reviews }: Props) {
	const { changesRequested } = reviews;

	if (changesRequested.length === 0) {
		return null;
	}

	return (
		<div className="absolute top-1 right-1 rounded-md px-1.5 py-0.5 opacity-70">
			<span className="block text-center text-[10px] font-black uppercase leading-tight tracking-wider text-red-700 dark:text-red-400">Changes<br/>requested</span>
		</div>
	);
}
