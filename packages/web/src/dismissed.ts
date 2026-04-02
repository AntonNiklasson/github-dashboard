import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

interface DismissedEntry {
	key: string; // `${repo}#${number}`
	dismissedAt: string; // ISO timestamp
}

const dismissedAtom = atomWithStorage<DismissedEntry[]>("dismissedReviews", []);

export const dismissedReviewsAtom = atom(
	(get) => get(dismissedAtom),
	(get, set, update: DismissedEntry[] | ((prev: DismissedEntry[]) => DismissedEntry[])) => {
		const prev = get(dismissedAtom);
		const next = typeof update === "function" ? update(prev) : update;
		set(dismissedAtom, next);
	},
);

export function dismissKey(repo: string, number: number) {
	return `${repo}#${number}`;
}

export function isDismissed(
	dismissed: DismissedEntry[],
	repo: string,
	number: number,
	updatedAt: string,
): boolean {
	const key = dismissKey(repo, number);
	const entry = dismissed.find((d) => d.key === key);
	if (!entry) return false;
	// Reappear if updated after dismissal
	return new Date(updatedAt) <= new Date(entry.dismissedAt);
}
