import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { Settings } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, type ConfigResponse } from "./api";
import { dismissKey, dismissedReviewsAtom, isDismissed } from "./dismissed";
import { useChords } from "./use-chords";
import {
  type Action,
  ActionMenu,
  CommentDialog,
} from "./components/ActionMenu";
import { type CopyTarget, CopyMenu } from "./components/CopyMenu";
import { PrPanel } from "./components/PrPanel";
import { Text } from "./components/Text";
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
import type {
  Instance,
  Notification,
  PR,
  RecentPR,
  ReviewRequest,
} from "./types";
import { applyTheme, themeAtom } from "./theme";

type Tab = "all" | string;

const activeTabAtom = atomWithStorage<Tab>("activeTab", "all");

function splitGradient(colors: string[]): string {
  if (colors.length === 0) return "transparent";
  if (colors.length === 1) return colors[0];
  if (colors.length === 2) {
    return `linear-gradient(90deg, ${colors[0]} 50%, ${colors[1]} 50%)`;
  }
  const step = 100 / colors.length;
  const stops = colors
    .map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`)
    .join(", ");
  return `conic-gradient(from 180deg, ${stops})`;
}

export function App() {
  const { data: configRes, isLoading: configLoading } =
    useQuery<ConfigResponse>({
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
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const instanceTabs =
    instances?.map((i) => ({ id: i.id, label: i.label })) ?? [];
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
        <ErrorMessage message={error?.message ?? "Failed to load instances"} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="shrink-0 border-b bg-card">
        <div className="flex items-center gap-3 px-3 py-2">
          <div
            role="tablist"
            className="inline-flex items-center gap-1 rounded-lg bg-[oklch(0.94_0_0)] p-1 dark:bg-[oklch(0.22_0_0)]"
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              const dotStyle =
                tab.id === "all"
                  ? {
                      background: splitGradient(
                        instanceTabs.map((t) => getInstanceColor(t.id)),
                      ),
                    }
                  : { backgroundColor: getInstanceColor(tab.id) };
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    active
                      ? "bg-background text-foreground shadow-sm dark:bg-[oklch(0.32_0_0)] dark:shadow-none"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={dotStyle} />
                  <Text bold>{tab.label}</Text>
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setSettingsOpen(true)}
              title="Settings (,)"
            >
              <Settings />
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "all" && instances.length > 1 ? (
          <MultiInstanceDashboard instances={instances} />
        ) : (
          <SingleInstanceDashboard
            instance={
              (activeTab === "all"
                ? instances[0]
                : instances.find((i) => i.id === activeTab)) ?? instances[0]
            }
            authorFilter={filterParam ?? undefined}
          />
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
  readOnly?: boolean;
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

interface CommentingPr {
  instanceId: string;
  repo: string;
  number: number;
}

function getActionsForItem(
  item: FocusedItem,
  queryClient: ReturnType<typeof useQueryClient>,
  onDone: () => void,
  setEditingPrNumber?: (prNumber: number) => void,
  setCommentingPr?: (pr: CommentingPr) => void,
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
        const base = item.url.replace(/\/pull\/\d+.*$/, "");
        window.open(
          `${base}/pulls?q=author%3A${item.author}+is%3Aopen+sort%3Aupdated-desc`,
          "_blank",
        );
      },
    });
  }

  if (
    item.section === "prs" &&
    item.repo &&
    item.number &&
    item.instanceId &&
    !item.readOnly
  ) {
    actions.push({
      label: item.autoMerge ? "Disable auto-merge" : "Enable auto-merge",
      key: "m",
      onSelect: async () => {
        queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
          old?.map((pr) =>
            pr.number === item.number && pr.repo === item.repo
              ? { ...pr, autoMerge: !item.autoMerge }
              : pr,
          ),
        );
        try {
          await api.toggleAutoMerge(item.instanceId!, item.repo!, item.number!);
        } catch {
          onDone();
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

    if (setCommentingPr) {
      actions.push({
        label: "Post comment",
        key: "c",
        onSelect: () => {
          setCommentingPr({
            instanceId: item.instanceId!,
            repo: item.repo!,
            number: item.number!,
          });
        },
      });
    }

    actions.push({
      label: "Rerun CI",
      key: "i",
      onSelect: async () => {
        try {
          await api.rerunCi(item.instanceId!, item.repo!, item.number!);
        } catch (err) {
          console.error("Failed to rerun CI:", err);
        }
      },
    });
  }

  if (
    (item.section === "prs" || item.section === "reviews") &&
    item.repo &&
    item.number &&
    item.instanceId &&
    !item.readOnly
  ) {
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
      key: "x",
      confirm: "Are you sure you want to close this PR?",
      onSelect: async () => {
        // Optimistic: remove from open PRs, add to recent
        queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
          old?.filter(
            (pr) => !(pr.number === item.number && pr.repo === item.repo),
          ),
        );
        queryClient.setQueriesData<RecentPR[]>(
          { queryKey: ["recent-prs"] },
          (old) => [
            {
              id: Date.now(),
              number: item.number!,
              title: item.title,
              url: item.url,
              repo: item.repo!,
              updatedAt: new Date().toISOString(),
              merged: false,
            },
            ...(old ?? []),
          ],
        );
        try {
          await api.closePr(item.instanceId!, item.repo!, item.number!);
        } catch {
          onDone(); // revert on failure
        }
      },
    });
  }

  return actions;
}

interface DashboardSource {
  instances: Instance[];
  prs: {
    data: PR[];
    isLoading: boolean;
    isFetching: boolean;
    error: Error | null;
  };
  recentPrs: { data: RecentPR[] };
  reviews: {
    data: ReviewRequest[];
    isLoading: boolean;
    isFetching: boolean;
    error: Error | null;
  };
  notifications: {
    data: Notification[];
    isLoading: boolean;
    isFetching: boolean;
    error: Error | null;
  };
}

function MultiInstanceDashboard({ instances }: { instances: Instance[] }) {
  const prs = useAllAuthoredPrs(instances);
  const recentPrs = useAllRecentPrs(instances);
  const reviews = useAllReviewRequests(instances);
  const notifications = useAllNotifications(instances);
  const source: DashboardSource = {
    instances,
    prs: {
      data: prs.data,
      isLoading: prs.isLoading,
      isFetching: prs.isFetching,
      error: prs.error as Error | null,
    },
    recentPrs: { data: recentPrs.data },
    reviews: {
      data: reviews.data,
      isLoading: reviews.isLoading,
      isFetching: reviews.isFetching,
      error: reviews.error as Error | null,
    },
    notifications: {
      data: notifications.data,
      isLoading: notifications.isLoading,
      isFetching: notifications.isFetching,
      error: notifications.error as Error | null,
    },
  };
  return <Dashboard source={source} />;
}

function SingleInstanceDashboard({
  instance,
  authorFilter,
}: {
  instance: Instance;
  authorFilter?: string;
}) {
  const prs = authorFilter
    ? useColleaguePrs(instance.id, authorFilter)
    : useAuthoredPrs(instance.id);
  const recentPrs = useRecentPrs(instance.id);
  const reviews = useReviewRequests(instance.id);
  const notifications = useNotifications(instance.id);
  const source: DashboardSource = {
    instances: [instance],
    prs: {
      data: prs.data ?? [],
      isLoading: prs.isLoading,
      isFetching: prs.isFetching,
      error: (prs.error as Error | null) ?? null,
    },
    recentPrs: { data: recentPrs.data ?? [] },
    reviews: {
      data: reviews.data ?? [],
      isLoading: reviews.isLoading,
      isFetching: reviews.isFetching,
      error: (reviews.error as Error | null) ?? null,
    },
    notifications: {
      data: notifications.data ?? [],
      isLoading: notifications.isLoading,
      isFetching: notifications.isFetching,
      error: (notifications.error as Error | null) ?? null,
    },
  };
  return <Dashboard source={source} />;
}

function Dashboard({ source }: { source: DashboardSource }) {
  const queryClient = useQueryClient();
  const { instances, prs, recentPrs, reviews, notifications } = source;
  const [dismissed, setDismissed] = useAtom(dismissedReviewsAtom);

  const filteredReviews = useMemo(
    () =>
      reviews.data.filter(
        (r) => !isDismissed(dismissed, r.repo, r.number, r.updatedAt),
      ),
    [reviews.data, dismissed],
  );

  const sections: Section[] = ["prs", "reviews", "notifications"];
  const itemCounts = {
    prs: prs.data.length + recentPrs.data.length,
    reviews: filteredReviews.length,
    notifications: notifications.data.length,
  };

  const nav = useKeyboardNav(sections, itemCounts);
  const [actionMenu, setActionMenu] = useState<FocusedItem | null>(null);
  const [copyMenu, setCopyMenu] = useState<CopyTarget | null>(null);
  const [panelPr, setPanelPr] = useState<PanelData | null>(null);
  const [togglingDraftId, setTogglingDraftId] = useState<number | null>(null);
  const [editingPrNumber, setEditingPrNumber] = useState<number | null>(null);
  const [commentingPr, setCommentingPr] = useState<CommentingPr | null>(null);
  const [commentLoading, setCommentLoading] = useState(false);
  const actionMenuTimerRef = useRef<number | null>(null);

  const overlayOpenRef = useRef(false);
  const updateOverlay = () => {
    overlayOpenRef.current = !!(
      actionMenu ||
      copyMenu ||
      panelPr ||
      editingPrNumber ||
      commentingPr
    );
  };
  useEffect(updateOverlay, [
    actionMenu,
    copyMenu,
    panelPr,
    editingPrNumber,
    commentingPr,
  ]);

  const openActionMenu = (item: FocusedItem) => {
    nav.setPaused(true);
    setActionMenu(item);
  };
  const closeActionMenu = () => {
    nav.setPaused(false);
    setActionMenu(null);
    if (actionMenuTimerRef.current) clearTimeout(actionMenuTimerRef.current);
  };
  const openCopyMenu = (item: FocusedItem) => {
    if (!item.repo || !item.number || !item.instanceId) return;
    nav.setPaused(true);
    setCopyMenu({
      url: item.url,
      title: item.title,
      repo: item.repo,
      number: item.number,
      instanceId: item.instanceId,
      additions: item.additions ?? 0,
      deletions: item.deletions ?? 0,
      headBranch: item.headBranch,
    });
  };
  const closeCopyMenu = () => {
    nav.setPaused(false);
    setCopyMenu(null);
  };
  const openPanel = (item: FocusedItem) => {
    if (!item.repo || !item.number || !item.instanceId || !item.reviews) return;
    nav.setPaused(true);
    setPanelPr({
      title: item.title,
      body: item.body ?? "",
      url: item.url,
      repo: item.repo,
      number: item.number,
      additions: item.additions ?? 0,
      deletions: item.deletions ?? 0,
      reviews: item.reviews,
      instanceId: item.instanceId,
    });
  };
  const closePanel = () => {
    nav.setPaused(false);
    setPanelPr(null);
  };

  const navRef = useRef(nav);
  const prsRef = useRef(prs.data);
  const recentPrsRef = useRef(recentPrs.data);
  const reviewsRef = useRef(filteredReviews);
  const notificationsRef = useRef(notifications.data);
  const instancesRef = useRef(instances);
  navRef.current = nav;
  prsRef.current = prs.data;
  recentPrsRef.current = recentPrs.data;
  reviewsRef.current = filteredReviews;
  notificationsRef.current = notifications.data;
  instancesRef.current = instances;

  const getFocused = () =>
    getFocusedItem(
      navRef.current.activeSection,
      navRef.current.focusIndex,
      prsRef.current,
      recentPrsRef.current,
      reviewsRef.current,
      notificationsRef.current,
      instancesRef.current,
    );
  const getMaxIdx = () =>
    Math.max(
      0,
      ({
        prs: prsRef.current.length + recentPrsRef.current.length,
        reviews: reviewsRef.current.length,
        notifications: notificationsRef.current.length,
      }[navRef.current.activeSection] ?? 0) - 1,
    );

  const chordGroups: KeyGroup[] = useMemo(
    () => [
      {
        prefix: "g",
        label: "Go to...",
        bindings: [
          { key: "g", label: "Top", action: () => nav.setFocusIndex(0) },
          {
            key: "G",
            label: "Bottom",
            action: () => nav.setFocusIndex(getMaxIdx()),
          },
          {
            key: "o",
            label: "Open in browser",
            action: () => {
              const item = getFocused();
              if (item?.url) window.open(item.url, "_blank");
            },
          },
          {
            key: "r",
            label: "Open repo",
            action: () => {
              const item = getFocused();
              if (item?.url)
                window.open(item.url.replace(/\/pull\/\d+.*$/, ""), "_blank");
            },
          },
        ],
      },
    ],
    [nav],
  );

  const chords = useChords(chordGroups, !!(actionMenu || copyMenu || panelPr));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
      const item = getFocused();

      if (e.key === "o") {
        if (item?.url) window.open(item.url, "_blank");
        e.preventDefault();
      } else if (
        (e.key === "Enter" || e.key === " ") &&
        (activeSection === "prs" || activeSection === "reviews")
      ) {
        if (item) openPanel(item);
        e.preventDefault();
      } else if (e.key === ".") {
        if (item) openActionMenu(item);
        e.preventDefault();
      } else if (e.key === "y") {
        if (item) openCopyMenu(item);
        e.preventDefault();
      } else if (
        e.key === "r" &&
        (activeSection === "prs" || activeSection === "reviews")
      ) {
        if (item?.url) {
          window.open(item.url.replace(/\/pull\/\d+.*$/, ""), "_blank");
          e.preventDefault();
        }
      } else if (e.key === "m" && activeSection === "prs") {
        if (item?.repo && item.number && item.instanceId && !item.readOnly) {
          e.preventDefault();
          queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
            old?.map((pr) =>
              pr.number === item.number && pr.repo === item.repo
                ? { ...pr, autoMerge: !item.autoMerge }
                : pr,
            ),
          );
          api
            .toggleAutoMerge(item.instanceId, item.repo, item.number)
            .catch(() => {
              queryClient.invalidateQueries({ queryKey: ["prs"] });
              toast.error("Failed to toggle auto-merge");
            });
        }
      } else if (
        e.key === "a" &&
        (activeSection === "prs" || activeSection === "reviews")
      ) {
        if (
          item?.repo &&
          item.number &&
          item.instanceId &&
          !item.readOnly &&
          confirm("Approve this PR?")
        ) {
          e.preventDefault();
          api.approvePr(item.instanceId, item.repo, item.number).then(() => {
            queryClient.invalidateQueries({ queryKey: ["prs"] });
            queryClient.invalidateQueries({ queryKey: ["reviews"] });
            toast("PR approved");
          });
        }
      } else if (
        e.key === "c" &&
        (activeSection === "prs" || activeSection === "reviews")
      ) {
        if (
          item?.repo &&
          item.number &&
          item.instanceId &&
          !item.readOnly &&
          confirm("Close this PR?")
        ) {
          e.preventDefault();
          queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
            old?.filter(
              (pr) => !(pr.number === item.number && pr.repo === item.repo),
            ),
          );
          queryClient.setQueriesData<RecentPR[]>(
            { queryKey: ["recent-prs"] },
            (old) => [
              {
                id: Date.now(),
                number: item.number!,
                title: item.title,
                url: item.url,
                repo: item.repo!,
                updatedAt: new Date().toISOString(),
                merged: false,
              },
              ...(old ?? []),
            ],
          );
          api.closePr(item.instanceId, item.repo, item.number).catch(() => {
            queryClient.invalidateQueries({ queryKey: ["prs"] });
            toast.error("Failed to close PR");
          });
        }
      } else if (e.key === "d" && activeSection === "prs") {
        const pr = prsRef.current[focusIndex];
        if (
          pr &&
          item?.repo &&
          item.number &&
          item.instanceId &&
          !item.readOnly
        ) {
          e.preventDefault();
          const newDraft = !pr.draft;
          setTogglingDraftId(pr.id);
          queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
            old?.map((p) => (p.id === pr.id ? { ...p, draft: newDraft } : p)),
          );
          toast(newDraft ? "Marked as draft" : "Marked as ready for review");
          api
            .toggleDraft(item.instanceId, item.repo, item.number)
            .catch(() => {
              queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
                old?.map((p) =>
                  p.id === pr.id ? { ...p, draft: !newDraft } : p,
                ),
              );
              toast.error("Failed to toggle draft");
            })
            .finally(() => setTogglingDraftId(null));
        }
      } else if (e.key === "e" && activeSection === "reviews") {
        const r = reviewsRef.current[focusIndex];
        if (r) {
          setDismissed((prev) => [
            ...prev.filter((d) => d.key !== dismissKey(r.repo, r.number)),
            {
              key: dismissKey(r.repo, r.number),
              dismissedAt: new Date().toISOString(),
            },
          ]);
          toast("Review dismissed — will reappear on new activity");
        }
        e.preventDefault();
      } else if (e.key === "e" && activeSection === "notifications") {
        if (item?.notificationId && item.instanceId) {
          e.preventDefault();
          queryClient.setQueriesData<Notification[]>(
            { queryKey: ["notifications"] },
            (old) => old?.filter((n) => n.id !== item.notificationId),
          );
          toast("Notification marked as done");
          api
            .dismissNotification(item.instanceId, item.notificationId)
            .catch(() => {
              queryClient.invalidateQueries({ queryKey: ["notifications"] });
              toast.error("Failed to dismiss notification");
            });
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [queryClient]);

  return (
    <div className="grid h-full grid-cols-[2fr_2fr_1fr] overflow-hidden">
      <Column
        section="prs"
        label="My PRs"
        count={itemCounts.prs}
        isActive={nav.activeSection === "prs"}
        isFetching={prs.isFetching}
        onActivate={() => {
          nav.setActiveSection("prs");
          nav.setFocusIndex(0);
        }}
      >
        {prs.isLoading ? (
          <Skeleton />
        ) : prs.error ? (
          <ErrorMessage message={prs.error.message} />
        ) : (
          <PrList
            prs={prs.data}
            focusIndex={nav.focusIndex}
            isFocusedSection={nav.activeSection === "prs"}
            togglingDraftId={togglingDraftId ?? undefined}
            recentPrs={recentPrs.data}
            editingPrNumber={editingPrNumber ?? undefined}
            onSaveTitle={async (prNumber, title) => {
              const pr = prs.data.find((p) => p.number === prNumber);
              if (!pr) return;
              const instanceId = pr.instanceId ?? instances[0]?.id;
              if (!instanceId) return;
              queryClient.setQueriesData<PR[]>({ queryKey: ["prs"] }, (old) =>
                old?.map((p) =>
                  p.number === prNumber && p.repo === pr.repo
                    ? { ...p, title }
                    : p,
                ),
              );
              try {
                await api.updatePrTitle(instanceId, pr.repo, prNumber, title);
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
        onActivate={() => {
          nav.setActiveSection("reviews");
          nav.setFocusIndex(0);
        }}
      >
        {reviews.isLoading ? (
          <Skeleton />
        ) : reviews.error ? (
          <ErrorMessage message={reviews.error.message} />
        ) : (
          <ReviewList
            reviews={filteredReviews}
            focusIndex={nav.focusIndex}
            isFocusedSection={nav.activeSection === "reviews"}
          />
        )}
      </Column>

      <Column
        section="notifications"
        label="Notifications"
        count={itemCounts.notifications}
        isActive={nav.activeSection === "notifications"}
        isFetching={notifications.isFetching}
        onActivate={() => {
          nav.setActiveSection("notifications");
          nav.setFocusIndex(0);
        }}
      >
        {notifications.isLoading ? (
          <Skeleton />
        ) : notifications.error ? (
          <ErrorMessage message={notifications.error.message} />
        ) : (
          <NotificationList
            notifications={notifications.data}
            focusIndex={nav.focusIndex}
            isFocusedSection={nav.activeSection === "notifications"}
          />
        )}
      </Column>

      {actionMenu && (
        <ActionMenu
          actions={getActionsForItem(
            actionMenu,
            queryClient,
            () => {
              queryClient.invalidateQueries({ queryKey: ["prs"] });
              queryClient.invalidateQueries({ queryKey: ["reviews"] });
            },
            setEditingPrNumber,
            setCommentingPr,
          )}
          onClose={closeActionMenu}
        />
      )}

      {copyMenu && <CopyMenu target={copyMenu} onClose={closeCopyMenu} />}

      {panelPr && <PrPanel pr={panelPr} onClose={closePanel} />}

      {commentingPr && (
        <CommentDialog
          loading={commentLoading}
          onSubmit={async (body) => {
            setCommentLoading(true);
            try {
              await api.postComment(
                commentingPr.instanceId,
                commentingPr.repo,
                commentingPr.number,
                body,
              );
              toast("Comment posted");
              setCommentingPr(null);
              nav.setPaused(false);
            } catch {
              toast("Failed to post comment");
            } finally {
              setCommentLoading(false);
            }
          }}
          onClose={() => {
            setCommentingPr(null);
            nav.setPaused(false);
          }}
        />
      )}

      {chords.showPopup && chords.activeGroup && (
        <WhichKey group={chords.activeGroup} onClose={chords.cancel} />
      )}

      {nav.showHelp && <ShortcutHelp onClose={() => nav.setShowHelp(false)} />}
    </div>
  );
}

function getFocusedItem(
  section: Section,
  idx: number,
  prs: PR[],
  recentPrs: RecentPR[],
  reviews: ReviewRequest[],
  notifications: Notification[],
  instances: Instance[],
): FocusedItem | null {
  if (section === "prs" && prs[idx]) {
    const p = prs[idx];
    const inst =
      instances.find((i) => i.label === p.instanceLabel) ?? instances[0];
    return {
      url: p.url,
      title: p.title,
      body: p.body,
      section,
      repo: p.repo,
      number: p.number,
      instanceId: inst?.id,
      additions: p.additions,
      deletions: p.deletions,
      reviews: p.reviews,
      autoMerge: p.autoMerge,
      author: p.author,
      headBranch: p.headBranch,
    };
  }
  if (section === "prs" && recentPrs[idx - prs.length]) {
    const p = recentPrs[idx - prs.length];
    const inst =
      instances.find((i) => i.label === p.instanceLabel) ?? instances[0];
    return {
      url: p.url,
      title: p.title,
      section,
      repo: p.repo,
      number: p.number,
      instanceId: inst?.id,
      additions: p.additions,
      deletions: p.deletions,
      reviews: { approved: [], changesRequested: [] },
      headBranch: p.headBranch,
      readOnly: true,
    };
  }
  if (section === "reviews" && reviews[idx]) {
    const r = reviews[idx];
    const inst =
      instances.find((i) => i.label === r.instanceLabel) ?? instances[0];
    return {
      url: r.url,
      title: r.title,
      body: r.body,
      section,
      repo: r.repo,
      number: r.number,
      instanceId: inst?.id,
      additions: r.additions,
      deletions: r.deletions,
      reviews: r.reviews,
      author: r.author,
      headBranch: r.headBranch,
    };
  }
  if (section === "notifications" && notifications[idx]) {
    const n = notifications[idx];
    const inst =
      instances.find((i) => i.label === n.instanceLabel) ?? instances[0];
    return {
      url: n.url,
      title: n.title,
      section,
      notificationId: n.id,
      instanceId: inst?.id,
    };
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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4 scroll-pt-2 scroll-pb-2">
        {children}
      </div>
    </div>
  );
}
