import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, type ConfigResponse } from "./api";
import { dismissKey, dismissedReviewsAtom, isDismissed } from "./dismissed";
import { useChords } from "./use-chords";
import { type Action, ActionMenu } from "./components/ActionMenu";
import { type CopyTarget, CopyMenu } from "./components/CopyMenu";
import { PrPanel } from "./components/PrPanel";
import { type KeyGroup, WhichKey } from "./components/WhichKey";
import { ErrorMessage } from "./components/ErrorMessage";
import { NotificationList } from "./components/NotificationList";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { PrList } from "./components/PrList";
import { ReviewList } from "./components/ReviewList";
import { SectionHeader } from "./components/SectionHeader";
import { SettingsModal } from "./components/SettingsModal";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { Skeleton } from "./components/Skeleton";
import {
	type Section,
	useAllAuthoredPrs,
	useAllNotifications,
	useAllRecentPrs,
	useAllReviewRequests,
	useAuthoredPrs,
	useColleaguePrs,
	useInstances,
	useKeyboardNav,
	useNotifications,
	useRecentPrs,
	useReviewRequests,
} from "./hooks";
import { getInstanceColor } from "./instance-colors";
import type { Instance, Notification, PR, RecentPR, ReviewRequest } from "./types";
import { applyTheme, themeAtom } from "./theme";

type Tab = "all" | string;

const activeTabAtom = atomWithStorage<Tab>("activeTab", "all");

export function App() {
	const { data: configRes, isLoading: configLoading } = useQuery<ConfigResponse>({
		queryKey: ["config"],
		queryFn: api.getConfig,
	});
	const queryClient = useQueryClient();
	const { data: instances, isLoading, error } = useInstances();
	const [activeTab, setActiveTab] = useAtom(activeTabAtom);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [theme] = useAtom(themeAtom);
	useEffect(() => applyTheme(theme), [theme]);
	useEffect(() => {
		const hideCursorOnKeyboard = () => {
			if (!document.querySelector('[data-has-moved="true"]')) return;
			document.documentElement.classList.add("hide-cursor");
		};
		const showCursorOnMouse = () => {
			document.documentElement.classList.remove("hide-cursor");
			document.documentElement.setAttribute("data-has-moved", "true");
		};
		
		window.addEventListener("keydown", hideCursorOnKeyboard);
		window.addEventListener("mousemove", showCursorOnMouse);
		return () => {
			window.removeEventListener("keydown", hideCursorOnKeyboard);
			window.removeEventListener("mousemove", showCursorOnMouse);
		};
	}, []);

	const urlParams = new URLSearchParams(window.location.search);
	const filterParam = urlParams.get("filter");

	// `,` shortcut for settings
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
			if (e.key === ",") {
				e.preventDefault();
				setSettingsOpen(true);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	const instanceTabs = instances?.map((i) => ({ id: i.id, label: i.label })) ?? [];
	const tabs: { id: Tab; label: string }[] = [
		...(instanceTabs.length > 1 ? [{ id: "all" as Tab, label: "All" }] : []),
		...instanceTabs,
	];

	useEffect(() => {
		if (!instances) return;

		const handler = (e: KeyboardEvent) => {
			if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) {
				if (
					e.target instanceof HTMLInputElement ||
					e.target instanceof HTMLTextAreaElement
				)
					return;

				e.preventDefault();
				const currentIdx = tabs.findIndex((t) => t.id === activeTab);
				const next = e.shiftKey
					? (currentIdx - 1 + tabs.length) % tabs.length
					: (currentIdx + 1) % tabs.length;
				setActiveTab(tabs[next].id);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [instances, activeTab, tabs]);

	if (configLoading || isLoading) {
		return (
			<div className="p-6">
				<Skeleton count={5} />
			</div>
		);
	}

	if (configRes && !configRes.exists) {
		return (
			<OnboardingScreen
				onComplete={() => {
					queryClient.invalidateQueries({ queryKey: ["config"] });
					queryClient.invalidateQueries({ queryKey: ["instances"] });
				}}
			/>
		);
	}

	if (error || !instances) {
		return (
			<div className="p-6">
				<ErrorMessage
					message={error?.message ?? "Failed to load instances"}
				/>
			</div>
		);
	}

	return (
		<div className="fixed inset-0 flex flex-col bg-background">
			<header className="shrink-0 border-b bg-card px-6 py-3">
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-2">
						{tabs.map((tab) => {
							const color = tab.id !== "all" ? getInstanceColor(tab.id) : undefined;
							return (
								<Button
									key={tab.id}
									size="sm"
									variant={activeTab === tab.id ? "default" : "secondary"}
									onClick={() => setActiveTab(tab.id)}
									className="gap-1.5"
									style={activeTab !== tab.id && color ? { borderBottom: `2px solid ${color}` } : undefined}
								>
									{tab.id === "all" ? (
										<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
											<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.6-8.6c.8-1.1 2-1.7 3.3-1.7H22" />
											<path d="M18 2l4 4-4 4" />
											<path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l6.6 8.6c.8 1.1 2 1.7 3.3 1.7H22" />
											<path d="M18 14l4 4-4 4" />
										</svg>
									) : (
										<span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
									)}
									{tab.label}
								</Button>
							);
						})}
						<kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
							?
						</kbd>
					</div>
					<div className="ml-auto flex items-center gap-2">
						<Button
							size="sm"
							variant="ghost"
							onClick={() => setSettingsOpen(true)}
							title="Settings (,)"
						>
							<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
								<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
						</Button>
					</div>
				</div>
			</header>

			<div className="min-h-0 flex-1 overflow-hidden">
				{activeTab === "all" && instances.length > 1 ? (
					<AllDashboard instances={instances} />
				) : (
					<Dashboard instanceId={activeTab === "all" ? instances[0]?.id ?? "" : activeTab} authorFilter={filterParam ?? undefined} />
				)}
			</div>

			<SettingsModal
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				config={configRes?.config}
				onSaved={() => {
					queryClient.invalidateQueries({ queryKey: ["config"] });
					queryClient.invalidateQueries({ queryKey: ["instances"] });
				}}
			/>
		</div>
	);
}

interface FocusedItem {
	url: string;
	title: string;
	body?: string;
	section: Section;
	repo?: string;
	number?: number;
	instanceId?: string;
	additions?: number;
	deletions?: number;
	reviews?: { approved: string[]; changesRequested: string[] };
	autoMerge?: boolean;
	notificationId?: string;
	author?: string;
	headBranch?: string;
}

interface PanelData {
	title: string;
	body: string;
	url: string;
	repo: string;
	number: number;
	additions: number;
	deletions: number;
	reviews: { approved: string[]; changesRequested: string[] };
	instanceId: string;
}

function getActionsForItem(
	item: FocusedItem,
	queryClient: ReturnType<typeof useQueryClient>,
	onDone: () => void,
	setEditingPrNumber?: (prNumber: number) => void,
	instances?: Instance[],
): Action[] {
	const actions: Action[] = [
		{
			label: "Open in browser",
			key: "o",
			onSelect: () => {
				window.open(item.url, "_blank");
			},
		},
	];

	if (item.repo && item.url) {
		const repoUrl = item.url.replace(/\/pull\/\d+.*$/, "");
		actions.push({
			label: "Open repo",
			key: "r",
			onSelect: () => {
				window.open(repoUrl, "_blank");
			},
		});
	}

	if (item.author && item.repo && item.instanceId) {
		actions.push({
			label: `View ${item.author}'s PRs`,
			key: "f",
			onSelect: () => {
				window.open(`https://github.com/${item.repo}/pulls?q=author%3A${item.author}+is%3Aopen+sort%3Aupdated-desc`, "_blank");
			},
		});
	}

	if (item.section === "prs" && item.repo && item.number && item.instanceId) {
		actions.push({
			label: item.autoMerge ? "Disable auto-merge" : "Enable auto-merge",
			key: "m",
			onSelect: async () => {
				// Optimistic update
				queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
					old?.map((pr) => pr.number === item.number && pr.repo === item.repo ? { ...pr, autoMerge: !item.autoMerge } : pr),
				);
				try {
					await api.toggleAutoMerge(item.instanceId!, item.repo!, item.number!);
				} catch {
					onDone(); // revert on failure
				}
			},
		});

		if (setEditingPrNumber) {
			actions.push({
				label: "Edit title",
				key: "t",
				onSelect: () => {
					setEditingPrNumber(item.number!);
				},
			});
		}

		actions.push({
			label: "Rerun CI",
			key: "x",
			onSelect: async () => {
				try {
					await api.rerunCi(item.instanceId!, item.repo!, item.number!);
				} catch (err) {
					console.error("Failed to rerun CI:", err);
				}
			},
		});
	}

	if (item.repo && item.url) {
		const repoUrl = item.url.replace(/\/pull\/\d+.*$/, "");
		actions.push({
			label: "Open repo",
			key: "r",
			onSelect: () => {
				window.open(repoUrl, "_blank");
			},
		});
	}

	if (item.author && item.repo && item.instanceId) {
		actions.push({
			label: `View ${item.author}'s PRs`,
			key: "f",
			onSelect: () => {
				window.open(`https://github.com/${item.repo}/pulls?q=author%3A${item.author}+is%3Aopen+sort%3Aupdated-desc`, "_blank");
			},
		});
	}

	if (item.section === "prs" && item.repo && item.number && item.instanceId) {
		actions.push({
			label: item.autoMerge ? "Disable auto-merge" : "Enable auto-merge",
			key: "m",
			onSelect: async () => {
				// Optimistic update
				queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
					old?.map((pr) => pr.number === item.number && pr.repo === item.repo ? { ...pr, autoMerge: !item.autoMerge } : pr),
				);
				try {
					await api.toggleAutoMerge(item.instanceId!, item.repo!, item.number!);
				} catch {
					onDone(); // revert on failure
				}
			},
		});
	}

	if ((item.section === "prs" || item.section === "reviews") && item.repo && item.number && item.instanceId) {
		actions.push({
			label: "Approve",
			key: "a",
			confirm: "Are you sure you want to approve this PR?",
			onSelect: async () => {
				await api.approvePr(item.instanceId!, item.repo!, item.number!);
				onDone();
			},
		});
		actions.push({
			label: "Close",
			key: "c",
			confirm: "Are you sure you want to close this PR?",
			onSelect: async () => {
				// Optimistic: remove from open PRs, add to recent
				queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
					old?.filter((pr) => !(pr.number === item.number && pr.repo === item.repo)),
				);
				queryClient.setQueriesData<RecentPR[]>({ queryKey: ["recent-prs"] }, (old) => [
					{ id: Date.now(), number: item.number!, title: item.title, url: item.url, repo: item.repo!, updatedAt: new Date().toISOString(), merged: false },
					...(old ?? []),
				]);
				try {
					await api.closePr(item.instanceId!, item.repo!, item.number!);
				} catch {
					onDone(); // revert on failure
				}
			},
		});
	}

	if (item.repo && item.number && item.instanceId && instances) {
		const inst = instances.find((i) => i.id === item.instanceId);
		if (inst?.hasSlackWebhook) {
			actions.push({
				label: "Share to Slack",
				key: "s",
				onSelect: async () => {
					await api.shareToSlack(item.instanceId!, item.repo!, item.number!);
					toast("Shared to Slack");
				},
			});
		}
	}

	return actions;
}

function AllDashboard({ instances }: { instances: Instance[] }) {
	const queryClient = useQueryClient();
	const prs = useAllAuthoredPrs(instances);
	const recentPrs = useAllRecentPrs(instances);
	const reviews = useAllReviewRequests(instances);
	const notifications = useAllNotifications(instances);
	const [dismissed, setDismissed] = useAtom(dismissedReviewsAtom);

	const filteredReviews = useMemo(
		() => reviews.data.filter((r) => !isDismissed(dismissed, r.repo, r.number, r.updatedAt)),
		[reviews.data, dismissed],
	);

	const sections: Section[] = ["prs", "reviews", "notifications"];
	const itemCounts = {
		prs: prs.data.length + (recentPrs.data?.length ?? 0),
		reviews: filteredReviews.length,
		notifications: notifications.data.length,
	};

	const nav = useKeyboardNav(sections, itemCounts);
	const [actionMenu, setActionMenu] = useState<FocusedItem | null>(null);
	const [copyMenu, setCopyMenu] = useState<CopyTarget | null>(null);
	const [panelPr, setPanelPr] = useState<PanelData | null>(null);
	const [togglingDraftId, setTogglingDraftId] = useState<number | null>(null);
	const [editingPrNumber, setEditingPrNumber] = useState<number | null>(null);
	const actionMenuTimerRef = useRef<number | null>(null);

	const overlayOpenRef = useRef(false);
	const updateOverlay = () => { overlayOpenRef.current = !!(actionMenu || copyMenu || panelPr || editingPrNumber); };
	useEffect(updateOverlay, [actionMenu, copyMenu, panelPr, editingPrNumber]);

	const openActionMenu = (item: FocusedItem) => { nav.setPaused(true); setActionMenu(item); };
	const closeActionMenu = () => { 
		nav.setPaused(false); 
		setActionMenu(null); 
		if (actionMenuTimerRef.current) clearTimeout(actionMenuTimerRef.current);
	};
	const openCopyMenu = (item: FocusedItem) => {
		if (!item.repo || !item.number || !item.instanceId) return;
		nav.setPaused(true);
		setCopyMenu({ url: item.url, title: item.title, repo: item.repo, number: item.number, instanceId: item.instanceId, additions: item.additions ?? 0, deletions: item.deletions ?? 0, headBranch: item.headBranch });
	};
	const closeCopyMenu = () => { nav.setPaused(false); setCopyMenu(null); };
	const openPanel = (item: FocusedItem) => {
		if (!item.repo || !item.number || !item.instanceId || !item.reviews) return;
		nav.setPaused(true);
		setPanelPr({ title: item.title, body: item.body ?? "", url: item.url, repo: item.repo, number: item.number, additions: item.additions ?? 0, deletions: item.deletions ?? 0, reviews: item.reviews, instanceId: item.instanceId });
	};
	const closePanel = () => { nav.setPaused(false); setPanelPr(null); };

	const navRef = useRef(nav);
	const prsRef = useRef(prs.data);
	const reviewsRef = useRef(filteredReviews);
	const notificationsRef = useRef(notifications.data);
	navRef.current = nav;
	prsRef.current = prs.data;
	reviewsRef.current = filteredReviews;
	notificationsRef.current = notifications.data;

	const getFocusedAll = () => getFocusedItem(navRef.current.activeSection, navRef.current.focusIndex, prsRef.current, reviewsRef.current, notificationsRef.current, instances);
	const getMaxIdxAll = () => Math.max(0, (({ prs: prsRef.current.length, reviews: reviewsRef.current.length, notifications: notificationsRef.current.length })[navRef.current.activeSection] ?? 0) - 1);

	const chordGroups: KeyGroup[] = useMemo(() => [
		{
			prefix: "g",
			label: "Go to...",
			bindings: [
				{ key: "g", label: "Top", action: () => nav.setFocusIndex(0) },
				{ key: "G", label: "Bottom", action: () => nav.setFocusIndex(getMaxIdxAll()) },
				{ key: "o", label: "Open in browser", action: () => { const item = getFocusedAll(); if (item?.url) window.open(item.url, "_blank"); } },
				{ key: "r", label: "Open repo", action: () => { const item = getFocusedAll(); if (item?.url) { window.open(item.url.replace(/\/pull\/\d+.*$/, ""), "_blank"); } } },
			],
		},
	], [instances, nav]);

	const chords = useChords(chordGroups, !!(actionMenu || copyMenu || panelPr));

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			// Clear any pending action menu timers on any keypress
			if (actionMenuTimerRef.current) {
				clearTimeout(actionMenuTimerRef.current);
				actionMenuTimerRef.current = null;
			}

			if (overlayOpenRef.current) return;
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			)
				return;
			if (e.metaKey || e.ctrlKey) return;

			if (chords.handleKey(e.key)) {
				e.preventDefault();
				return;
			}

			const { activeSection, focusIndex } = navRef.current;

			if (e.key === "o") {
				const url = getFocusedUrl(activeSection, focusIndex, prsRef.current, reviewsRef.current, notificationsRef.current);
				if (url) window.open(url, "_blank");
				e.preventDefault();
			} else if ((e.key === "Enter" || e.key === " ") && (activeSection === "prs" || activeSection === "reviews")) {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current, reviewsRef.current, notificationsRef.current, instances);
				if (item) openPanel(item);
				e.preventDefault();
			} else if (e.key === ".") {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current, reviewsRef.current, notificationsRef.current, instances);
				if (item) openActionMenu(item);
				e.preventDefault();
			} else if (e.key === "y") {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current, reviewsRef.current, notificationsRef.current, instances);
				if (item) openCopyMenu(item);
				e.preventDefault();
			} else if (e.key === "r" && (activeSection === "prs" || activeSection === "reviews")) {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current, reviewsRef.current, notificationsRef.current, instances);
				if (item?.url) {
					const repoUrl = item.url.replace(/\/pull\/\d+.*$/, "");
					window.open(repoUrl, "_blank");
					e.preventDefault();
				}
			} else if (e.key === "m" && activeSection === "prs") {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current, reviewsRef.current, notificationsRef.current, instances);
				if (item?.repo && item.number && item.instanceId) {
					e.preventDefault();
					queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
						old?.map((pr) => pr.number === item.number && pr.repo === item.repo ? { ...pr, autoMerge: !item.autoMerge } : pr),
					);
					api.toggleAutoMerge(item.instanceId, item.repo, item.number).catch(() => {
						prs.refetchAll();
						toast.error("Failed to toggle auto-merge");
					});
				}
			} else if (e.key === "a" && (activeSection === "prs" || activeSection === "reviews")) {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current, reviewsRef.current, notificationsRef.current, instances);
				if (item?.repo && item.number && item.instanceId && confirm("Approve this PR?")) {
					e.preventDefault();
					api.approvePr(item.instanceId, item.repo, item.number).then(() => {
						prs.refetchAll();
						reviews.refetchAll();
						toast("PR approved");
					});
				}
			} else if (e.key === "c" && (activeSection === "prs" || activeSection === "reviews")) {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current, reviewsRef.current, notificationsRef.current, instances);
				if (item?.repo && item.number && item.instanceId && confirm("Close this PR?")) {
					e.preventDefault();
					queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
						old?.filter((pr) => !(pr.number === item.number && pr.repo === item.repo)),
					);
					queryClient.setQueriesData<RecentPR[]>({ queryKey: ["recent-prs"] }, (old) => [
						{ id: Date.now(), number: item.number!, title: item.title, url: item.url, repo: item.repo!, updatedAt: new Date().toISOString(), merged: false },
						...(old ?? []),
					]);
					api.closePr(item.instanceId, item.repo, item.number).catch(() => {
						prs.refetchAll();
						toast.error("Failed to close PR");
					});
				}
			} else if (e.key === "d" && activeSection === "prs") {
				const pr = prsRef.current[focusIndex];
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current, reviewsRef.current, notificationsRef.current, instances);
				if (pr && item?.repo && item.number && item.instanceId) {
					e.preventDefault();
					const newDraft = !pr.draft;
					setTogglingDraftId(pr.id);
					queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
						old?.map((p) => p.id === pr.id ? { ...p, draft: newDraft } : p),
					);
					toast(newDraft ? "Marked as draft" : "Marked as ready for review");
					api.toggleDraft(item.instanceId, item.repo, item.number).catch(() => {
						queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
							old?.map((p) => p.id === pr.id ? { ...p, draft: !newDraft } : p),
						);
						toast.error("Failed to toggle draft");
					}).finally(() => setTogglingDraftId(null));
				}
			} else if (e.key === "e" && activeSection === "reviews") {
				const r = reviewsRef.current[focusIndex];
				if (r) {
					setDismissed((prev) => [
						...prev.filter((d) => d.key !== dismissKey(r.repo, r.number)),
						{ key: dismissKey(r.repo, r.number), dismissedAt: new Date().toISOString() },
					]);
					toast("Review dismissed — will reappear on new activity");
				}
				e.preventDefault();
			} else if (e.key === "e" && activeSection === "notifications") {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current, reviewsRef.current, notificationsRef.current, instances);
				if (item?.notificationId && item.instanceId) {
					e.preventDefault();
					// Optimistic remove
					queryClient.setQueriesData<Notification[]>({ queryKey: ["notifications"] }, (old) =>
						old?.filter((n) => n.id !== item.notificationId),
					);
					toast("Notification marked as done");
					api.dismissNotification(item.instanceId, item.notificationId).catch(() => {
						notifications.refetchAll();
						toast.error("Failed to dismiss notification");
					});
				}
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [instances, prs, reviews, notifications]);

	return (
		<div className="grid h-full grid-cols-[2fr_2fr_1fr] overflow-hidden">
			<Column
				section="prs"
				label="My PRs"
				count={itemCounts.prs}
				isActive={nav.activeSection === "prs"}
				isFetching={prs.isFetching}
	
				onActivate={() => { nav.setActiveSection("prs"); nav.setFocusIndex(0); }}
			>
				{prs.isLoading ? <Skeleton /> : prs.error ? <ErrorMessage message={prs.error.message} /> : (
					<PrList 
						prs={prs.data} 
						focusIndex={nav.focusIndex} 
						isFocusedSection={nav.activeSection === "prs"} 
						_togglingDraftId={togglingDraftId ?? undefined} 
						recentPrs={recentPrs.data}
						editingPrNumber={editingPrNumber ?? undefined}
						onSaveTitle={async (prNumber, title) => {
							const pr = prs.data?.find((p) => p.number === prNumber);
							if (!pr || !pr.instanceId) return;
							queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
								old?.map((p) => p.number === prNumber && p.repo === pr.repo ? { ...p, title } : p),
							);
							try {
								await api.updatePrTitle(pr.instanceId, pr.repo, prNumber, title);
							} catch {
								queryClient.invalidateQueries({ queryKey: ["prs"] });
							}
							setEditingPrNumber(null);
						}}
					/>
				)}
			</Column>

			<Column
				section="reviews"
				label="Review Requests"
				count={itemCounts.reviews}
				isActive={nav.activeSection === "reviews"}
				isFetching={reviews.isFetching}
	
				onActivate={() => { nav.setActiveSection("reviews"); nav.setFocusIndex(0); }}
			>
				{reviews.isLoading ? <Skeleton /> : reviews.error ? <ErrorMessage message={reviews.error.message} /> : (
					<ReviewList reviews={filteredReviews} focusIndex={nav.focusIndex} isFocusedSection={nav.activeSection === "reviews"}  />
				)}
			</Column>

			<Column
				section="notifications"
				label="Notifications"
				count={itemCounts.notifications}
				isActive={nav.activeSection === "notifications"}
				isFetching={notifications.isFetching}
	
				onActivate={() => { nav.setActiveSection("notifications"); nav.setFocusIndex(0); }}
			>
				{notifications.isLoading ? <Skeleton /> : notifications.error ? <ErrorMessage message={notifications.error.message} /> : (
					<NotificationList notifications={notifications.data} focusIndex={nav.focusIndex} isFocusedSection={nav.activeSection === "notifications"} />
				)}
			</Column>

			{actionMenu && (
				<ActionMenu
					actions={getActionsForItem(actionMenu, queryClient, () => {
						reviews.refetchAll();
						prs.refetchAll();
					}, setEditingPrNumber, instances)}
					onClose={closeActionMenu}
				/>
			)}

			{copyMenu && <CopyMenu target={copyMenu} onClose={closeCopyMenu} />}

			{panelPr && <PrPanel pr={panelPr} onClose={closePanel} />}

			{chords.showPopup && chords.activeGroup && (
				<WhichKey group={chords.activeGroup} onClose={chords.cancel} />
			)}

			{nav.showHelp && (
				<ShortcutHelp onClose={() => nav.setShowHelp(false)} />
			)}
		</div>
	);
}

function Dashboard({ instanceId, authorFilter }: { instanceId: string; authorFilter?: string }) {
	const queryClient = useQueryClient();
	const { data: instances } = useInstances();
	const prs = authorFilter ? useColleaguePrs(instanceId, authorFilter) : useAuthoredPrs(instanceId);
	const recentPrs = useRecentPrs(instanceId);
	const reviews = useReviewRequests(instanceId);
	const notifications = useNotifications(instanceId);
	const [dismissed, setDismissed] = useAtom(dismissedReviewsAtom);

	const filteredReviews = useMemo(
		() => (reviews.data ?? []).filter((r) => !isDismissed(dismissed, r.repo, r.number, r.updatedAt)),
		[reviews.data, dismissed],
	);

	const sections: Section[] = ["prs", "reviews", "notifications"];
	const itemCounts = {
		prs: (prs.data?.length ?? 0) + (recentPrs.data?.length ?? 0),
		reviews: filteredReviews.length,
		notifications: notifications.data?.length ?? 0,
	};

	const nav = useKeyboardNav(sections, itemCounts);
	const [actionMenu, setActionMenu] = useState<FocusedItem | null>(null);
	const [copyMenu, setCopyMenu] = useState<CopyTarget | null>(null);
	const [panelPr, setPanelPr] = useState<PanelData | null>(null);
	const [togglingDraftId, setTogglingDraftId] = useState<number | null>(null);
	const [editingPrNumber, setEditingPrNumber] = useState<number | null>(null);
	const actionMenuTimerRef = useRef<number | null>(null);

	const overlayOpenRef = useRef(false);
	const updateOverlay = () => { overlayOpenRef.current = !!(actionMenu || copyMenu || panelPr || editingPrNumber); };
	useEffect(updateOverlay, [actionMenu, copyMenu, panelPr, editingPrNumber]);

	const openActionMenu = (item: FocusedItem) => { nav.setPaused(true); setActionMenu(item); };
	const closeActionMenu = () => { 
		nav.setPaused(false); 
		setActionMenu(null); 
		if (actionMenuTimerRef.current) clearTimeout(actionMenuTimerRef.current);
	};
	const openCopyMenu = (item: FocusedItem) => {
		if (!item.repo || !item.number) return;
		nav.setPaused(true);
		setCopyMenu({ url: item.url, title: item.title, repo: item.repo, number: item.number, instanceId: instanceId, additions: item.additions ?? 0, deletions: item.deletions ?? 0, headBranch: item.headBranch });
	};
	const closeCopyMenu = () => { nav.setPaused(false); setCopyMenu(null); };
	const openPanel = (item: FocusedItem) => {
		if (!item.repo || !item.number || !item.reviews) return;
		nav.setPaused(true);
		setPanelPr({ title: item.title, body: item.body ?? "", url: item.url, repo: item.repo, number: item.number, additions: item.additions ?? 0, deletions: item.deletions ?? 0, reviews: item.reviews, instanceId: instanceId });
	};
	const closePanel = () => { nav.setPaused(false); setPanelPr(null); };

	const navRef = useRef(nav);
	const prsRef = useRef(prs.data);
	const reviewsRef = useRef(filteredReviews);
	const notificationsRef = useRef(notifications.data);
	navRef.current = nav;
	prsRef.current = prs.data;
	reviewsRef.current = filteredReviews;
	notificationsRef.current = notifications.data;

	const getFocusedSingle = () => getFocusedItem(navRef.current.activeSection, navRef.current.focusIndex, prsRef.current ?? [], reviewsRef.current, notificationsRef.current ?? [], [{ id: instanceId, label: "", username: "" }]);
	const getMaxIdxSingle = () => Math.max(0, (({ prs: (prsRef.current ?? []).length, reviews: reviewsRef.current.length, notifications: (notificationsRef.current ?? []).length })[navRef.current.activeSection] ?? 0) - 1);

	const chordGroupsSingle: KeyGroup[] = useMemo(() => [
		{
			prefix: "g",
			label: "Go to...",
			bindings: [
				{ key: "g", label: "Top", action: () => nav.setFocusIndex(0) },
				{ key: "G", label: "Bottom", action: () => nav.setFocusIndex(getMaxIdxSingle()) },
				{ key: "o", label: "Open in browser", action: () => { const item = getFocusedSingle(); if (item?.url) window.open(item.url, "_blank"); } },
				{ key: "r", label: "Open repo", action: () => { const item = getFocusedSingle(); if (item?.url) { window.open(item.url.replace(/\/pull\/\d+.*$/, ""), "_blank"); } } },
			],
		},
	], [instanceId, nav]);

	const chordsSingle = useChords(chordGroupsSingle, !!(actionMenu || copyMenu || panelPr));

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			// Clear any pending action menu timers on any keypress
			if (actionMenuTimerRef.current) {
				clearTimeout(actionMenuTimerRef.current);
				actionMenuTimerRef.current = null;
			}

			if (overlayOpenRef.current) return;
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			)
				return;
			if (e.metaKey || e.ctrlKey) return;

			if (chordsSingle.handleKey(e.key)) {
				e.preventDefault();
				return;
			}

			const { activeSection, focusIndex } = navRef.current;

			if (e.key === "o") {
				const url = getFocusedUrl(activeSection, focusIndex, prsRef.current ?? [], reviewsRef.current, notificationsRef.current ?? []);
				if (url) window.open(url, "_blank");
				e.preventDefault();
			} else if ((e.key === "Enter" || e.key === " ") && (activeSection === "prs" || activeSection === "reviews")) {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current ?? [], reviewsRef.current, notificationsRef.current ?? [], [{ id: instanceId, label: "", username: "" }]);
				if (item) openPanel(item);
				e.preventDefault();
			} else if (e.key === ".") {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current ?? [], reviewsRef.current, notificationsRef.current ?? [], [{ id: instanceId, label: "", username: "" }]);
				if (item) openActionMenu(item);
				e.preventDefault();
			} else if (e.key === "y") {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current ?? [], reviewsRef.current, notificationsRef.current ?? [], [{ id: instanceId, label: "", username: "" }]);
				if (item) openCopyMenu(item);
				e.preventDefault();
			} else if (e.key === "r" && (activeSection === "prs" || activeSection === "reviews")) {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current ?? [], reviewsRef.current, notificationsRef.current ?? [], [{ id: instanceId, label: "", username: "" }]);
				if (item?.url) {
					const repoUrl = item.url.replace(/\/pull\/\d+.*$/, "");
					window.open(repoUrl, "_blank");
					e.preventDefault();
				}
			} else if (e.key === "m" && activeSection === "prs") {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current ?? [], reviewsRef.current, notificationsRef.current ?? [], [{ id: instanceId, label: "", username: "" }]);
				if (item?.repo && item.number && item.instanceId) {
					e.preventDefault();
					queryClient.setQueryData<PR[]>(["prs", instanceId], (old) =>
						old?.map((pr) => pr.number === item.number && pr.repo === item.repo ? { ...pr, autoMerge: !item.autoMerge } : pr),
					);
					api.toggleAutoMerge(item.instanceId, item.repo, item.number).catch(() => {
						queryClient.invalidateQueries({ queryKey: ["prs", instanceId] });
						toast.error("Failed to toggle auto-merge");
					});
				}
			} else if (e.key === "a" && (activeSection === "prs" || activeSection === "reviews")) {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current ?? [], reviewsRef.current, notificationsRef.current ?? [], [{ id: instanceId, label: "", username: "" }]);
				if (item?.repo && item.number && item.instanceId && confirm("Approve this PR?")) {
					e.preventDefault();
					api.approvePr(item.instanceId, item.repo, item.number).then(() => {
						queryClient.invalidateQueries({ queryKey: ["prs", instanceId] });
						queryClient.invalidateQueries({ queryKey: ["reviews", instanceId] });
						toast("PR approved");
					});
				}
			} else if (e.key === "c" && (activeSection === "prs" || activeSection === "reviews")) {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current ?? [], reviewsRef.current, notificationsRef.current ?? [], [{ id: instanceId, label: "", username: "" }]);
				if (item?.repo && item.number && item.instanceId && confirm("Close this PR?")) {
					e.preventDefault();
					queryClient.setQueryData<PR[]>(["prs", instanceId], (old) =>
						old?.filter((pr) => !(pr.number === item.number && pr.repo === item.repo)),
					);
					queryClient.setQueryData<RecentPR[]>(["recent-prs", instanceId], (old) => [
						{ id: Date.now(), number: item.number!, title: item.title, url: item.url, repo: item.repo!, updatedAt: new Date().toISOString(), merged: false },
						...(old ?? []),
					]);
					api.closePr(item.instanceId, item.repo, item.number).catch(() => {
						queryClient.invalidateQueries({ queryKey: ["prs", instanceId] });
						toast.error("Failed to close PR");
					});
				}
			} else if (e.key === "d" && activeSection === "prs") {
				const pr = (prsRef.current ?? [])[focusIndex];
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current ?? [], reviewsRef.current, notificationsRef.current ?? [], [{ id: instanceId, label: "", username: "" }]);
				if (pr && item?.repo && item.number && item.instanceId) {
					e.preventDefault();
					const newDraft = !pr.draft;
					setTogglingDraftId(pr.id);
					queryClient.setQueryData<PR[]>(["prs", instanceId], (old) =>
						old?.map((p) => p.id === pr.id ? { ...p, draft: newDraft } : p),
					);
					toast(newDraft ? "Marked as draft" : "Marked as ready for review");
					api.toggleDraft(item.instanceId, item.repo, item.number).catch(() => {
						queryClient.setQueryData<PR[]>(["prs", instanceId], (old) =>
							old?.map((p) => p.id === pr.id ? { ...p, draft: !newDraft } : p),
						);
						toast.error("Failed to toggle draft");
					}).finally(() => setTogglingDraftId(null));
				}
			} else if (e.key === "e" && activeSection === "reviews") {
				const r = reviewsRef.current[focusIndex];
				if (r) {
					setDismissed((prev) => [
						...prev.filter((d) => d.key !== dismissKey(r.repo, r.number)),
						{ key: dismissKey(r.repo, r.number), dismissedAt: new Date().toISOString() },
					]);
					toast("Review dismissed — will reappear on new activity");
				}
				e.preventDefault();
			} else if (e.key === "e" && activeSection === "notifications") {
				const item = getFocusedItem(activeSection, focusIndex, prsRef.current ?? [], reviewsRef.current, notificationsRef.current ?? [], [{ id: instanceId, label: "", username: "" }]);
				if (item?.notificationId && item.instanceId) {
					e.preventDefault();
					queryClient.setQueryData<Notification[]>(["notifications", instanceId], (old) =>
						old?.filter((n) => n.id !== item.notificationId),
					);
					toast("Notification marked as done");
					api.dismissNotification(item.instanceId, item.notificationId).catch(() => {
						queryClient.invalidateQueries({ queryKey: ["notifications", instanceId] });
						toast.error("Failed to dismiss notification");
					});
				}
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [instanceId, queryClient]);

	return (
		<div className="grid h-full grid-cols-[2fr_2fr_1fr] overflow-hidden">
			<Column
				section="prs"
				label="My PRs"
				count={itemCounts.prs}
				isActive={nav.activeSection === "prs"}
				isFetching={prs.isFetching}
	
				onActivate={() => { nav.setActiveSection("prs"); nav.setFocusIndex(0); }}
			>
				{prs.isLoading ? <Skeleton /> : prs.error ? <ErrorMessage message={prs.error.message} /> : (
					<PrList 
						prs={prs.data ?? []} 
						focusIndex={nav.focusIndex} 
						isFocusedSection={nav.activeSection === "prs"} 
						_togglingDraftId={togglingDraftId ?? undefined} 
						recentPrs={recentPrs.data}
						editingPrNumber={editingPrNumber ?? undefined}
						onSaveTitle={async (prNumber, title) => {
							queryClient.setQueriesData<PR[]>({ queryKey: ["prs", instanceId] }, (old) =>
								old?.map((p) => p.number === prNumber ? { ...p, title } : p),
							);
							try {
								await api.updatePrTitle(instanceId, prs.data?.find((p) => p.number === prNumber)?.repo ?? "", prNumber, title);
							} catch {
								queryClient.invalidateQueries({ queryKey: ["prs", instanceId] });
							}
							setEditingPrNumber(null);
						}}
					/>
				)}
			</Column>

			<Column
				section="reviews"
				label="Review Requests"
				count={itemCounts.reviews}
				isActive={nav.activeSection === "reviews"}
				isFetching={reviews.isFetching}
	
				onActivate={() => { nav.setActiveSection("reviews"); nav.setFocusIndex(0); }}
			>
				{reviews.isLoading ? <Skeleton /> : reviews.error ? <ErrorMessage message={reviews.error.message} /> : (
					<ReviewList reviews={filteredReviews} focusIndex={nav.focusIndex} isFocusedSection={nav.activeSection === "reviews"}  />
				)}
			</Column>

			<Column
				section="notifications"
				label="Notifications"
				count={itemCounts.notifications}
				isActive={nav.activeSection === "notifications"}
				isFetching={notifications.isFetching}
	
				onActivate={() => { nav.setActiveSection("notifications"); nav.setFocusIndex(0); }}
			>
				{notifications.isLoading ? <Skeleton /> : notifications.error ? <ErrorMessage message={notifications.error.message} /> : (
					<NotificationList notifications={notifications.data ?? []} focusIndex={nav.focusIndex} isFocusedSection={nav.activeSection === "notifications"} />
				)}
			</Column>

			{actionMenu && (
				<ActionMenu
					actions={getActionsForItem(actionMenu, queryClient, () => {
						queryClient.invalidateQueries({ queryKey: ["reviews", instanceId] });
						queryClient.invalidateQueries({ queryKey: ["prs", instanceId] });
					}, setEditingPrNumber, instances)}
					onClose={closeActionMenu}
				/>
			)}

			{copyMenu && <CopyMenu target={copyMenu} onClose={closeCopyMenu} />}

			{panelPr && <PrPanel pr={panelPr} onClose={closePanel} />}

			{chordsSingle.showPopup && chordsSingle.activeGroup && (
				<WhichKey group={chordsSingle.activeGroup} onClose={chordsSingle.cancel} />
			)}

			{nav.showHelp && (
				<ShortcutHelp onClose={() => nav.setShowHelp(false)} />
			)}
		</div>
	);
}

function getFocusedUrl(
	section: Section,
	idx: number,
	prs: PR[],
	reviews: ReviewRequest[],
	notifications: Notification[],
): string | undefined {
	if (section === "prs") return prs[idx]?.url;
	if (section === "reviews") return reviews[idx]?.url;
	if (section === "notifications") return notifications[idx]?.url;
}

function getFocusedItem(
	section: Section,
	idx: number,
	prs: PR[],
	reviews: ReviewRequest[],
	notifications: Notification[],
	instances: Instance[],
): FocusedItem | null {
	if (section === "prs" && prs[idx]) {
		const p = prs[idx];
		const inst = instances.find((i) => i.label === p.instanceLabel) ?? instances[0];
		return { url: p.url, title: p.title, body: p.body, section, repo: p.repo, number: p.number, instanceId: inst?.id, additions: p.additions, deletions: p.deletions, reviews: p.reviews, autoMerge: p.autoMerge, author: p.author, headBranch: p.headBranch };
	}
	if (section === "reviews" && reviews[idx]) {
		const r = reviews[idx];
		const inst = instances.find((i) => i.label === r.instanceLabel) ?? instances[0];
		return { url: r.url, title: r.title, body: r.body, section, repo: r.repo, number: r.number, instanceId: inst?.id, additions: r.additions, deletions: r.deletions, reviews: r.reviews, author: r.author, headBranch: r.headBranch };
	}
	if (section === "notifications" && notifications[idx]) {
		const n = notifications[idx];
		const inst = instances.find((i) => i.label === n.instanceLabel) ?? instances[0];
		return { url: n.url, title: n.title, section, notificationId: n.id, instanceId: inst?.id };
	}
	return null;
}

function Column({
	section,
	label,
	count,
	isActive,
	isFetching,
	onActivate,
	children,
}: {
	section: Section;
	label: string;
	count: number;
	isActive: boolean;
	isFetching: boolean;
	onActivate: () => void;
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-0 flex-col overflow-hidden border-r last:border-r-0">
			<div className="shrink-0 px-4 pt-4 pb-2">
				<SectionHeader
					section={section}
					label={label}
					count={count}
					isActive={isActive}
					isFetching={isFetching}
					onClick={onActivate}
				/>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 scroll-pt-12">
				{children}
			</div>
		</div>
	);
}
