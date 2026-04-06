export function Skeleton({ count = 3 }: { count?: number }) {
	return (
		<div className="space-y-3">
			{Array.from({ length: count }, (_, i) => (
				<div
					key={i}
					className="h-16 animate-pulse rounded-lg bg-muted"
				/>
			))}
		</div>
	);
}
