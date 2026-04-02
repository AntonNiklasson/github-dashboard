import { getDefaultStore } from "jotai";
import { atomWithStorage } from "jotai/utils";

const DEFAULT_COLORS = [
	"#6366f1", // indigo
	"#e08d2e", // amber
	"#0d9488", // teal
	"#e11d48", // rose
];

// Map of instanceId → color, persisted in localStorage
export const instanceColorsAtom = atomWithStorage<Record<string, string>>("instanceColors", {});

// Derived: returns assigned defaults for any instance not yet customized
const defaultAssignments = new Map<string, string>();

export function getInstanceColor(instanceId: string): string {
	const store = getDefaultStore();
	const custom = store.get(instanceColorsAtom);
	if (custom[instanceId]) return custom[instanceId];

	if (!defaultAssignments.has(instanceId)) {
		defaultAssignments.set(instanceId, DEFAULT_COLORS[defaultAssignments.size % DEFAULT_COLORS.length]);
	}
	return defaultAssignments.get(instanceId)!;
}

export function getDefaultColor(instanceId: string): string {
	if (!defaultAssignments.has(instanceId)) {
		defaultAssignments.set(instanceId, DEFAULT_COLORS[defaultAssignments.size % DEFAULT_COLORS.length]);
	}
	return defaultAssignments.get(instanceId)!;
}
