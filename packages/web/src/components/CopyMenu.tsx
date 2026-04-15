import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../api";

export interface CopyTarget {
	url: string;
	repo: string;
	number: number;
	title: string;
	instanceId: string;
	additions: number;
	deletions: number;
	headBranch?: string;
}

interface CopyItem {
	label: string;
	key: string;
	value: string | (() => Promise<string>);
}

interface Props {
	target: CopyTarget;
	onClose: () => void;
}

export function CopyMenu({ target, onClose }: Props) {
	const [focusIdx, setFocusIdx] = useState(0);
	const [loading, setLoading] = useState(false);

	const items: CopyItem[] = [
		{ label: "PR number", key: "n", value: `#${target.number}` },
		{ label: "URL", key: "u", value: target.url },
		...(target.headBranch ? [{ label: "Branch name", key: "b", value: target.headBranch }] : []),
		{
			label: "Review request",
			key: "r",
			value: `[${target.title}](${target.url}) \`+${target.additions}/-${target.deletions}\``,
		},
		{
			label: "Changed files",
			key: "f",
			value: async () => {
				const meta = await api.prMeta(target.instanceId, target.repo, target.number);
				return meta.files.map((f) => f.filename).join("\n");
			},
		},
		{
			label: "Commit history",
			key: "c",
			value: async () => {
				const meta = await api.prMeta(target.instanceId, target.repo, target.number);
				return meta.commits.map((c) => `${c.sha} ${c.message}`).join("\n");
			},
		},
	];

	async function copyItem(item: CopyItem) {
		setLoading(true);
		try {
			const text = typeof item.value === "string" ? item.value : await item.value();
			await navigator.clipboard.writeText(text);
			onClose();
			toast(`Copied ${item.label.toLowerCase()}`);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			switch (e.key) {
				case "j":
				case "ArrowDown":
					setFocusIdx((i) => Math.min(i + 1, items.length - 1));
					e.preventDefault();
					break;
				case "k":
				case "ArrowUp":
					setFocusIdx((i) => Math.max(i - 1, 0));
					e.preventDefault();
					break;
				case "Enter":
					e.preventDefault();
					copyItem(items[focusIdx]);
					break;
				case "Escape":
					e.preventDefault();
					onClose();
					break;
				default:
					for (const item of items) {
						if (e.key === item.key) {
							e.preventDefault();
							copyItem(item);
							return;
						}
					}
					break;
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [focusIdx, items, onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={onClose}
		>
			<Card className="w-full max-w-xs p-2" onClick={(e) => e.stopPropagation()}>
				<div className="px-3 py-2 text-xs font-medium text-muted-foreground">
					Copy to clipboard
				</div>
				<ul>
					{items.map((item, i) => (
						<li key={item.key}>
							<button
								onClick={() => copyItem(item)}
								className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
									focusIdx === i
										? "bg-accent text-accent-foreground"
										: "text-foreground hover:bg-accent/50"
								}`}
							>
								<span className="flex items-center gap-2">
									{item.label}
									{loading && focusIdx === i && (
										<span className="text-xs text-muted-foreground">loading...</span>
									)}
								</span>
								<kbd className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
									{item.key}
								</kbd>
							</button>
						</li>
					))}
				</ul>
			</Card>
		</div>
	);
}
