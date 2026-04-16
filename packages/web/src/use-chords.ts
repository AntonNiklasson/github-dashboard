import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyGroup } from "./components/WhichKey";

const POPUP_DELAY = 1500; // ms before showing which-key popup
const CHORD_TIMEOUT = 1500; // ms before chord expires

export function useChords(groups: KeyGroup[], paused: boolean) {
	const [activeGroup, setActiveGroup] = useState<KeyGroup | null>(null);
	const [showPopup, setShowPopup] = useState(false);
	const popupTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const chordTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const groupsRef = useRef(groups);
	groupsRef.current = groups;

	const cancel = useCallback(() => {
		setActiveGroup(null);
		setShowPopup(false);
		clearTimeout(popupTimerRef.current);
		clearTimeout(chordTimerRef.current);
	}, []);

	// Returns true if the key was consumed by the chord system
	const handleKey = useCallback((key: string): boolean => {
		if (paused) return false;

		// If a prefix is active, try to execute the binding immediately
		if (activeGroup) {
			const binding = activeGroup.bindings.find((b) => b.key === key);
			cancel();
			if (binding) binding.action();
			return true;
		}

		// Check if this key is a prefix
		const group = groupsRef.current.find((g) => g.prefix === key);
		if (group) {
			setActiveGroup(group);
			// Show popup after delay
			popupTimerRef.current = setTimeout(() => setShowPopup(true), POPUP_DELAY);
			// Auto-cancel after timeout
			chordTimerRef.current = setTimeout(cancel, CHORD_TIMEOUT);
			return true;
		}

		return false;
	}, [paused, activeGroup, cancel]);

	// Cleanup timers
	useEffect(() => {
		return () => {
			clearTimeout(popupTimerRef.current);
			clearTimeout(chordTimerRef.current);
		};
	}, []);

	return { activeGroup, showPopup, handleKey, cancel };
}
