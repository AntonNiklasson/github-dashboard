import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEffect, useState, useRef } from "react";

export interface Action {
	label: string;
	key: string;
	onSelect: () => void | Promise<void>;
	confirm?: string;
}

interface Props {
	actions: Action[];
	onClose: () => void;
}

export function ActionMenu({ actions, onClose }: Props) {
	const [focusIdx, setFocusIdx] = useState(0);
	const [confirming, setConfirming] = useState<Action | null>(null);
	const [loading, setLoading] = useState(false);
	const confirmTimerRef = useRef<number | null>(null);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (confirming) {
				if (e.key === "y" || e.key === "Enter") {
					e.preventDefault();
					if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
					runAction(confirming);
				} else {
					e.preventDefault();
					if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
					setConfirming(null);
				}
				return;
			}

			switch (e.key) {
				case "j":
				case "ArrowDown":
					setFocusIdx((i) => Math.min(i + 1, actions.length - 1));
					e.preventDefault();
					break;
				case "k":
				case "ArrowUp":
					setFocusIdx((i) => Math.max(i - 1, 0));
					e.preventDefault();
					break;
				case "Enter": {
					e.preventDefault();
					const action = actions[focusIdx];
					if (action.confirm) {
						confirmTimerRef.current = window.setTimeout(() => setConfirming(action), 300);
					} else {
						runAction(action);
					}
					break;
				}
				case "Escape":
					e.preventDefault();
					onClose();
					break;
				default:
					for (const action of actions) {
						if (e.key === action.key) {
							e.preventDefault();
							if (action.confirm) {
								confirmTimerRef.current = window.setTimeout(() => setConfirming(action), 300);
							} else {
								runAction(action);
							}
							return;
						}
					}
					break;
			}
		};

		window.addEventListener("keydown", handler);
		return () => {
			window.removeEventListener("keydown", handler);
			if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
		};
	}, [actions, focusIdx, confirming, onClose]);

	async function runAction(action: Action) {
		setLoading(true);
		try {
			await action.onSelect();
		} finally {
			setLoading(false);
			onClose();
		}
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={onClose}
		>
			<Card
				className="w-full max-w-xs p-2"
				onClick={(e) => e.stopPropagation()}
			>
				{confirming ? (
					<div className="p-3 text-center">
						<p className="text-sm">{confirming.confirm}</p>
						{loading ? (
							<p className="mt-3 text-sm text-muted-foreground">Working...</p>
						) : (
							<div className="mt-3 flex justify-center gap-2">
								<Button size="sm" onClick={() => runAction(confirming)}>
									Yes (y)
								</Button>
								<Button
									size="sm"
									variant="secondary"
									onClick={() => setConfirming(null)}
								>
									Cancel
								</Button>
							</div>
						)}
					</div>
				) : (
					<ul>
						{actions.map((action, i) => (
							<li key={action.key}>
								<button
									onClick={() => {
										if (action.confirm) {
											setConfirming(action);
										} else {
											runAction(action);
										}
									}}
									className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
										focusIdx === i
											? "bg-accent text-accent-foreground"
											: "text-foreground hover:bg-accent/50"
									}`}
								>
									<span>{action.label}</span>
									<kbd className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
										{action.key}
									</kbd>
								</button>
							</li>
						))}
					</ul>
				)}
			</Card>
		</div>
	);
}

interface CommentDialogProps {
	onSubmit: (body: string) => void;
	onClose: () => void;
	loading?: boolean;
}

export function CommentDialog({ onSubmit, onClose, loading }: CommentDialogProps) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				if (value.trim()) onSubmit(value);
			} else if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [value, onSubmit, onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={onClose}
		>
			<Card
				className="w-full max-w-md p-4"
				onClick={(e) => e.stopPropagation()}
			>
				<p className="mb-2 text-sm font-medium">Post comment</p>
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					rows={4}
					className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
					placeholder="Write a comment..."
				/>
				<div className="mt-3 flex items-center justify-between">
					<span className="text-xs text-muted-foreground">⌘+Enter to submit</span>
					<div className="flex gap-2">
						<Button size="sm" variant="secondary" onClick={onClose}>
							Cancel
						</Button>
						<Button size="sm" disabled={!value.trim() || loading} onClick={() => value.trim() && onSubmit(value)}>
							{loading ? "Posting..." : "Post"}
						</Button>
					</div>
				</div>
			</Card>
		</div>
	);
}

interface EditTitleDialogProps {
	title: string;
	onSave: (newTitle: string) => void;
	onClose: () => void;
}

export function EditTitleDialog({ title, onSave, onClose }: EditTitleDialogProps) {
	const [value, setValue] = useState(title);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				if (value.trim() && value !== title) {
					onSave(value);
				} else {
					onClose();
				}
			} else if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [value, title, onSave, onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={onClose}
		>
			<Card
				className="w-full max-w-md p-4"
				onClick={(e) => e.stopPropagation()}
			>
				<p className="mb-2 text-sm font-medium">Edit title</p>
				<input
					ref={inputRef}
					type="text"
					value={value}
					onChange={(e) => setValue(e.target.value)}
					className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
				/>
				<div className="mt-4 flex justify-end gap-2">
					<Button size="sm" variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button size="sm" onClick={() => value.trim() && value !== title && onSave(value)}>
						Save
					</Button>
				</div>
			</Card>
		</div>
	);
}
