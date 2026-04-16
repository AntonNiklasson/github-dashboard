import { useEffect } from "react";
import { Card } from "@/components/ui/card";

interface Props {
	onClose: () => void;
}

const sections: { title: string; shortcuts: [string, string][] }[] = [
	{
		title: "Navigation",
		shortcuts: [
			["j / k or \u2193 / \u2191", "Move down / up"],
			["h / l or \u2190 / \u2192", "Move between columns"],
			["g g", "Jump to top"],
			["g G", "Jump to bottom"],
			["Tab", "Switch instance tab"],
			["\u2318K", "Command palette"],
		],
	},
	{
		title: "Open",
		shortcuts: [
			["o", "Open in browser"],
			["r", "Open repo"],
			["g o", "Open in browser (chord)"],
			["g r", "Open repo (chord)"],
		],
	},
	{
		title: "Actions",
		shortcuts: [
			["Enter / Space", "Open detail panel"],
			[".", "Action menu"],
			["y", "Copy menu"],
			["d", "Toggle draft"],
			["m", "Toggle auto-merge"],
			["a", "Approve PR"],
			["c", "Close PR"],
			["e", "Dismiss review / notification"],
		],
	},
	{
		title: "Other",
		shortcuts: [
			[",", "Settings"],
			["?", "This help"],
			["Esc", "Close overlay"],
		],
	},
];

export function ShortcutHelp({ onClose }: Props) {
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape" || e.key === "?") {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={onClose}
		>
			<Card
				className="max-h-[80vh] w-full max-w-lg overflow-y-auto p-6"
				onClick={(e) => e.stopPropagation()}
			>
				<h2 className="mb-4 text-lg font-semibold">Keyboard Shortcuts</h2>
				<div className="space-y-5">
					{sections.map((section) => (
						<div key={section.title}>
							<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h3>
							<dl className="space-y-1.5">
								{section.shortcuts.map(([key, desc]) => (
									<div key={key} className="flex items-center justify-between gap-4">
										<dt className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs">
											{key}
										</dt>
										<dd className="text-sm text-muted-foreground">{desc}</dd>
									</div>
								))}
							</dl>
						</div>
					))}
				</div>
			</Card>
		</div>
	);
}
