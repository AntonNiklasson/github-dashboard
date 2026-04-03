import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { Instance, LinearIssue, Notification, PR, RecentPR, ReviewRequest } from "./types";

const POLL_INTERVAL = 10_000; // 10s

// On page load, first fetch bypasses server cache to get fresh data from GitHub.
// Subsequent polls use the server cache. Module re-evaluates on full page reload.
let _fresh = true;
function useFreshRef() {
	const ref = useRef(_fresh);
	if (_fresh) _fresh = false;
	return ref;
}

export function useInstances() {
	return useQuery({
		queryKey: ["instances"],
		queryFn: api.instances,
		staleTime: Infinity,
	});
}

export function useAuthoredPrs(instanceId: string) {
	const freshRef = useFreshRef();
	return useQuery({
		queryKey: ["prs", instanceId],
		queryFn: () => { const f = freshRef.current; freshRef.current = false; return api.prs(instanceId, f); },
		refetchInterval: POLL_INTERVAL,
		enabled: !!instanceId,
	});
}

export function useRecentPrs(instanceId: string) {
	const freshRef = useFreshRef();
	return useQuery({
		queryKey: ["recent-prs", instanceId],
		queryFn: () => { const f = freshRef.current; freshRef.current = false; return api.recentPrs(instanceId, f); },
		refetchInterval: POLL_INTERVAL,
		enabled: !!instanceId,
	});
}

export function useReviewRequests(instanceId: string) {
	const freshRef = useFreshRef();
	return useQuery({
		queryKey: ["reviews", instanceId],
		queryFn: () => { const f = freshRef.current; freshRef.current = false; return api.reviews(instanceId, f); },
		refetchInterval: POLL_INTERVAL,
		enabled: !!instanceId,
	});
}

export function useNotifications(instanceId: string) {
	const freshRef = useFreshRef();
	return useQuery({
		queryKey: ["notifications", instanceId],
		queryFn: () => { const f = freshRef.current; freshRef.current = false; return api.notifications(instanceId, f); },
		refetchInterval: POLL_INTERVAL,
		enabled: !!instanceId,
	});
}

function byUpdatedDesc(a: { updatedAt: string }, b: { updatedAt: string }) {
	return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export function useAllAuthoredPrs(instances: Instance[]) {
	const freshRef = useFreshRef();
	const queries = useQueries({
		queries: instances.map((inst) => ({
			queryKey: ["prs", inst.id],
			queryFn: () => { const f = freshRef.current; freshRef.current = false; return api.prs(inst.id, f); },
			refetchInterval: POLL_INTERVAL,
		})),
	});

	const data = useMemo(() => {
		const merged: PR[] = [];
		for (let i = 0; i < queries.length; i++) {
			const items = queries[i].data;
			if (!items) continue;
			const { id, label } = instances[i];
			for (const item of items) {
				merged.push({ ...item, instanceId: id, instanceLabel: label });
			}
		}
		return merged.sort(byUpdatedDesc);
	}, [queries, instances]);

	const isLoading = queries.some((q) => q.isLoading);
	const isFetching = queries.some((q) => q.isFetching);
	const error = queries.find((q) => q.error)?.error ?? null;
	const refetchAll = () => queries.forEach((q) => q.refetch());

	return { data, isLoading, isFetching, error, refetchAll };
}

export function useAllRecentPrs(instances: Instance[]) {
	const freshRef = useFreshRef();
	const queries = useQueries({
		queries: instances.map((inst) => ({
			queryKey: ["recent-prs", inst.id],
			queryFn: () => { const f = freshRef.current; freshRef.current = false; return api.recentPrs(inst.id, f); },
			refetchInterval: POLL_INTERVAL,
		})),
	});

	const data = useMemo(() => {
		const merged: RecentPR[] = [];
		for (let i = 0; i < queries.length; i++) {
			const items = queries[i].data;
			if (!items) continue;
			const { id, label } = instances[i];
			for (const item of items) {
				merged.push({ ...item, instanceId: id, instanceLabel: label });
			}
		}
		return merged.sort(byUpdatedDesc);
	}, [queries, instances]);

	return { data };
}

export function useAllReviewRequests(instances: Instance[]) {
	const freshRef = useFreshRef();
	const queries = useQueries({
		queries: instances.map((inst) => ({
			queryKey: ["reviews", inst.id],
			queryFn: () => { const f = freshRef.current; freshRef.current = false; return api.reviews(inst.id, f); },
			refetchInterval: POLL_INTERVAL,
		})),
	});

	const data = useMemo(() => {
		const merged: ReviewRequest[] = [];
		for (let i = 0; i < queries.length; i++) {
			const items = queries[i].data;
			if (!items) continue;
			const { id, label } = instances[i];
			for (const item of items) {
				merged.push({ ...item, instanceId: id, instanceLabel: label });
			}
		}
		return merged.sort(byUpdatedDesc);
	}, [queries, instances]);

	const isLoading = queries.some((q) => q.isLoading);
	const isFetching = queries.some((q) => q.isFetching);
	const error = queries.find((q) => q.error)?.error ?? null;
	const refetchAll = () => queries.forEach((q) => q.refetch());

	return { data, isLoading, isFetching, error, refetchAll };
}

export function useAllNotifications(instances: Instance[]) {
	const freshRef = useFreshRef();
	const queries = useQueries({
		queries: instances.map((inst) => ({
			queryKey: ["notifications", inst.id],
			queryFn: () => { const f = freshRef.current; freshRef.current = false; return api.notifications(inst.id, f); },
			refetchInterval: POLL_INTERVAL,
		})),
	});

	const data = useMemo(() => {
		const merged: Notification[] = [];
		for (let i = 0; i < queries.length; i++) {
			const items = queries[i].data;
			if (!items) continue;
			const { id, label } = instances[i];
			for (const item of items) {
				merged.push({ ...item, instanceId: id, instanceLabel: label });
			}
		}
		return merged.sort(byUpdatedDesc);
	}, [queries, instances]);

	const isLoading = queries.some((q) => q.isLoading);
	const isFetching = queries.some((q) => q.isFetching);
	const error = queries.find((q) => q.error)?.error ?? null;
	const refetchAll = () => queries.forEach((q) => q.refetch());

	return { data, isLoading, isFetching, error, refetchAll };
}

export function useLinearStatus() {
	return useQuery({
		queryKey: ["linear-status"],
		queryFn: api.linearStatus,
		staleTime: 60_000,
	});
}

export function useLinearIssues(branches: string[]) {
	return useQuery({
		queryKey: ["linear-issues", branches.sort().join(",")],
		queryFn: () => api.linearIssues(branches),
		enabled: branches.length > 0,
		refetchInterval: 60_000, // Linear data changes less frequently
		staleTime: 30_000,
		select: (data) => data.issues,
	});
}

export function useSearchPrs(instanceId: string, query: string) {
	return useQuery({
		queryKey: ["search-prs", instanceId, query],
		queryFn: () => api.searchPrs(instanceId, query),
		enabled: !!instanceId && query.length >= 2,
	});
}

export function useColleaguePrs(instanceId: string, username: string) {
	return useQuery({
		queryKey: ["user-prs", instanceId, username],
		queryFn: () => api.userPrs(instanceId, username) as Promise<PR[]>,
		enabled: !!instanceId && username.length >= 2,
	});
}

export type Section = "prs" | "reviews" | "notifications";

export function useKeyboardNav(
	sections: Section[],
	itemCounts: Record<Section, number>,
) {
	const [activeSection, setActiveSection] = useState<Section>(sections[0]);
	const [focusIndex, setFocusIndex] = useState(0);
	const [showHelp, setShowHelp] = useState(false);

	const pausedRef = useRef(false);

	// Use refs so the single keydown handler always sees current values
	const sectionsRef = useRef(sections);
	const itemCountsRef = useRef(itemCounts);
	const activeSectionRef = useRef(activeSection);
	const focusIndexRef = useRef(focusIndex);
	sectionsRef.current = sections;
	itemCountsRef.current = itemCounts;
	activeSectionRef.current = activeSection;
	focusIndexRef.current = focusIndex;

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (pausedRef.current) return;
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			)
				return;
			if (e.metaKey || e.ctrlKey) return;

			const curSection = activeSectionRef.current;
			const curSections = sectionsRef.current;
			const maxIdx = Math.max(
				0,
				(itemCountsRef.current[curSection] ?? 0) - 1,
			);

			switch (e.key) {
				case "1":
					setActiveSection("prs");
					setFocusIndex(0);
					e.preventDefault();
					break;
				case "2":
					setActiveSection("reviews");
					setFocusIndex(0);
					e.preventDefault();
					break;
				case "3":
					setActiveSection("notifications");
					setFocusIndex(0);
					e.preventDefault();
					break;
				case "j":
				case "ArrowDown":
					setFocusIndex((i) => (i >= maxIdx ? 0 : i + 1));
					e.preventDefault();
					break;
				case "k":
				case "ArrowUp":
					setFocusIndex((i) => (i <= 0 ? maxIdx : i - 1));
					e.preventDefault();
					break;
				case "h":
				case "ArrowLeft": {
					const idx = curSections.indexOf(curSection);
					if (idx > 0) setActiveSection(curSections[idx - 1]);
					e.preventDefault();
					break;
				}
				case "l":
				case "ArrowRight": {
					const idx = curSections.indexOf(curSection);
					if (idx < curSections.length - 1)
						setActiveSection(curSections[idx + 1]);
					e.preventDefault();
					break;
				}
				case "?":
					setShowHelp((v) => !v);
					e.preventDefault();
					break;
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	const setPaused = (v: boolean) => { pausedRef.current = v; };

	return { activeSection, setActiveSection, focusIndex, setFocusIndex, showHelp, setShowHelp, setPaused };
}
