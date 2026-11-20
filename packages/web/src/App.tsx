import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, type ConfigResponse } from "./api";
import { dismissKey, dismissedReviewsAtom, isDismissed } from "./dismissed";
import { useChords } from "./use-chords";
import { type Action, ActionMenu } from "./components/ActionMenu";
import { type CopyTarget, CopyMenu } from "./components/CopyMenu";
import { PrPanel } from "./components/PrPanel";
import { Text } from "./components/Text";
import { type KeyGroup, WhichKey } from "./components/WhichKey";
import { ErrorMessage } from "./components/ErrorMessage";
import { NotificationList } from "./components/NotificationList";
import { PrList } from "./components/PrList";
import { ReviewList } from "./components/ReviewList";
import { SectionHeader } from "./components/SectionHeader";
import { RateLimits, SyncHealth } from "./components/SyncHealth";
import { Welcome } from "./components/Welcome";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { Skeleton } from "./components/Skeleton";
import { SortControl } from "./components/SortControl";
import {
  NOTIFICATION_SORT_FIELDS,
  PR_SORT_FIELDS,
  REVIEW_SORT_FIELDS,
  compareNotifications,
  comparePrs,
  compareReviews,
  notificationSortAtom,
  prSortAtom,
  reviewSortAtom,
} from "./sort";
import {
  type Section,
  activeSectionAtom,
  useAllAuthoredPrs,
  useAllNotifications,
  useAllReviewRequests,
  useAuthoredPrs,
  useKeyboardNav,
  useNotifications,
  useReviewRequests,
} from "./hooks";
import { getInstanceColor } from "./instance-colors";
import type { Instance, Notification, PR, ReviewRequest } from "./types";
import { applyTheme } from "./theme";
import * as mutations from "./mutations";

type Tab = "all" | string;

const activeTabAtom = atomWithStorage<Tab>("activeTab", "all");

const IS_ELECTRON =
  typeof navigator !== "undefined" && /Electron/.test(navigator.userAgent);

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
  const {
    data: configRes,
    isLoading: configLoading,
    error: configError,
  } = useQuery<ConfigResponse>({
    queryKey: ["config"],
    queryFn: api.getConfig,
  });
  const queryClient = useQueryClient();
  const instances =
    configRes?.status.kind === "ready" ? configRes.status.instances : [];
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const theme = configRes?.theme ?? "system";
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const reload = async () => {
      try {
        const next = await api.reloadConfig();
        queryClient.setQueryData(["config"], next);
      } catch {
        toast.error("Failed to reload config.");
      }
    };
    return window.electron?.onReloadConfig(reload);
  }, [queryClient]);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const update = () => {
      document.documentElement.style.setProperty(
        "--ghd-header-h",
        `${el.offsetHeight}px`,
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const bridge = window.electron;
    if (!bridge) return;
    bridge.hasPendingUpdate().then((has) => {
      if (has) setUpdateAvailable(true);
    });
    return bridge.onUpdateAvailable(() => setUpdateAvailable(true));
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(theme);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

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

  const showWelcome = configRes?.status.kind === "error";

  const instanceTabs = instances.map((i) => ({ id: i.id, label: i.label }));
  const tabs: { id: Tab; label: string }[] = [
    ...(instanceTabs.length > 1 ? [{ id: "all" as Tab, label: "All" }] : []),
    ...instanceTabs,
  ];

  useEffect(() => {
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

  if (configLoading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <Text variant="secondary">Checking configuration…</Text>
      </div>
    );
  }

  if (configError && !configRes) {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <ErrorMessage message={configError.message} />
      </div>
    );
  }

  const visibleInstances =
    activeTab === "all"
      ? instances
      : instances.filter((instance) => instance.id === activeTab);
  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header
        ref={headerRef}
        className="shrink-0 border-b bg-card [-webkit-app-region:drag]"
      >
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2",
            IS_ELECTRON && "pl-20",
          )}
        >
          {!showWelcome && <SectionTabs />}
          <div
            role="tablist"
            className="ml-auto inline-flex items-center gap-0.5 rounded-md bg-[oklch(0.94_0_0)] p-0.5 dark:bg-[oklch(0.22_0_0)] [-webkit-app-region:no-drag]"
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
                    "inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    active
                      ? "bg-background text-foreground shadow-sm dark:bg-[oklch(0.32_0_0)] dark:shadow-none"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={dotStyle} />
                  <Text bold>{tab.label}</Text>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 [-webkit-app-region:no-drag]">
            {!showWelcome && <SyncHealth instances={visibleInstances} />}
            {updateAvailable && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.electron?.installUpdate()}
                title="Restart and install update"
                className="h-7 gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
              >
                <ArrowUpCircle className="size-3.5" />
                <Text bold>Update available</Text>
              </Button>
            )}
            {!showWelcome && <RateLimits instances={visibleInstances} />}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {showWelcome && configRes ? (
          <Welcome
            path={configRes.path}
            example={configRes.example}
            errors={
              configRes.status.kind === "error" ? configRes.status.errors : []
            }
          />
        ) : instances.length > 0 ? (
          activeTab === "all" && instances.length > 1 ? (
            <MultiInstanceDashboard instances={instances} />
          ) : (
            <SingleInstanceDashboard
              instance={
                (activeTab === "all"
                  ? instances[0]
                  : instances.find((i) => i.id === activeTab)) ?? instances[0]
              }
            />
          )
        ) : null}
      </div>
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
  reviewDecision?: string | null;
  mergeStateStatus?: string | null;
  autoMerge?: boolean;
  autoMergeAllowed?: boolean;
  draft?: boolean;
  notificationId?: string;
  author?: string;
  headBranch?: string;
  baseBranch?: string;
  commentCount?: number;
  readOnly?: boolean;
  ciStatus?: string;
}

function toggleAutoMerge(
  queryClient: ReturnType<typeof useQueryClient>,
  item: FocusedItem & { instanceId: string; repo: string; number: number },
): void {
  if (!confirm(item.autoMerge ? "Disable auto-merge?" : "Enable auto-merge?"))
    return;
  mutations
    .toggleAutoMerge(queryClient, item, !!item.autoMerge)
    .catch(() => {});
}

function getActionsForItem(
  item: FocusedItem,
  queryClient: ReturnType<typeof useQueryClient>,
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
          `${base}/pulls?q=author%3A${item.author}+sort%3Aupdated-desc`,
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
    // GitHub rejects enablePullRequestAutoMerge on draft PRs.
    if (item.autoMerge || !item.draft) {
      actions.push({
        label: item.autoMerge ? "Disable auto-merge" : "Enable auto-merge",
        key: "m",
        onSelect: () => {
          toggleAutoMerge(queryClient, {
            ...item,
            instanceId: item.instanceId!,
            repo: item.repo!,
            number: item.number!,
          });
        },
      });
    }
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
      onSelect: () => {
        mutations
          .approvePr(queryClient, {
            instanceId: item.instanceId!,
            repo: item.repo!,
            number: item.number!,
          })
          .catch(() => {});
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

function SingleInstanceDashboard({ instance }: { instance: Instance }) {
  const prs = useAuthoredPrs(instance.id);
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
  const { instances, prs, reviews, notifications } = source;
  const [dismissed, setDismissed] = useAtom(dismissedReviewsAtom);
  const [prSort, setPrSort] = useAtom(prSortAtom);
  const [reviewSort, setReviewSort] = useAtom(reviewSortAtom);
  const [notificationSort, setNotificationSort] = useAtom(notificationSortAtom);

  const sortedPrs = useMemo(
    () => [...prs.data].sort((a, b) => comparePrs(a, b, prSort)),
    [prs.data, prSort],
  );

  const filteredReviews = useMemo(
    () =>
      reviews.data
        .filter((r) => !isDismissed(dismissed, r.repo, r.number, r.updatedAt))
        .sort((a, b) => compareReviews(a, b, reviewSort)),
    [reviews.data, dismissed, reviewSort],
  );

  const sortedNotifications = useMemo(
    () =>
      [...notifications.data].sort((a, b) =>
        compareNotifications(a, b, notificationSort),
      ),
    [notifications.data, notificationSort],
  );

  const sections: Section[] = ["prs", "reviews", "notifications"];
  const itemCounts = {
    prs: sortedPrs.length,
    reviews: filteredReviews.length,
    notifications: sortedNotifications.length,
  };

  const nav = useKeyboardNav(sections, itemCounts);
  const [actionMenu, setActionMenu] = useState<FocusedItem | null>(null);
  const [copyMenu, setCopyMenu] = useState<CopyTarget | null>(null);
  const [panelItem, setPanelItem] = useState<FocusedItem | null>(null);
  const [togglingDraftId, setTogglingDraftId] = useState<PR["id"] | null>(null);
  const actionMenuTimerRef = useRef<number | null>(null);

  const overlayOpenRef = useRef(false);
  const updateOverlay = () => {
    overlayOpenRef.current = !!(actionMenu || copyMenu || panelItem);
  };

  useEffect(updateOverlay, [actionMenu, copyMenu, panelItem]);

  const openActionMenu = (item: FocusedItem) => {
    nav.setPaused(true);
    setActionMenu(item);
  };
  const closeActionMenu = () => {
    setActionMenu(null);
    if (!panelItem) nav.setPaused(false);
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
    setPanelItem(item);
    const { instanceId, repo, number } = item;
    queryClient.prefetchQuery({
      queryKey: ["pr-diff", instanceId, repo, number],
      queryFn: () => api.prDiff(instanceId, repo, number),
    });
    queryClient.prefetchQuery({
      queryKey: ["pr-comments", instanceId, repo, number],
      queryFn: () => api.prComments(instanceId, repo, number),
    });
  };
  const closePanel = () => {
    nav.setPaused(false);
    setPanelItem(null);
  };

  const navRef = useRef(nav);
  const prsRef = useRef(sortedPrs);
  const reviewsRef = useRef(filteredReviews);
  const notificationsRef = useRef(sortedNotifications);
  const instancesRef = useRef(instances);
  navRef.current = nav;
  prsRef.current = sortedPrs;
  reviewsRef.current = filteredReviews;
  notificationsRef.current = sortedNotifications;
  instancesRef.current = instances;

  const getFocused = () =>
    getFocusedItem(
      navRef.current.activeSection,
      navRef.current.focusIndex,
      prsRef.current,
      reviewsRef.current,
      notificationsRef.current,
      instancesRef.current,
    );
  const getMaxIdx = () =>
    Math.max(
      0,
      ({
        prs: prsRef.current.length,
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

  const chords = useChords(
    chordGroups,
    !!(actionMenu || copyMenu || panelItem),
  );

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
          if (!item.autoMerge && item.draft) {
            toast.error("Mark the PR as ready before merging");
            return;
          }
          toggleAutoMerge(queryClient, {
            ...item,
            instanceId: item.instanceId,
            repo: item.repo,
            number: item.number,
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
          mutations
            .approvePr(queryClient, {
              instanceId: item.instanceId,
              repo: item.repo,
              number: item.number,
            })
            .catch(() => {});
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
          setTogglingDraftId(pr.id);
          mutations
            .toggleDraft(
              queryClient,
              {
                instanceId: item.instanceId,
                repo: item.repo,
                number: item.number,
              },
              pr.draft,
            )
            .catch(() => {})
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
          mutations
            .dismissNotification(queryClient, {
              instanceId: item.instanceId,
              notificationId: item.notificationId,
            })
            .catch(() => {});
        }
      } else if (e.code === "KeyS") {
        if (e.shiftKey) {
          const flip = (d: "asc" | "desc") => (d === "asc" ? "desc" : "asc");
          if (activeSection === "prs") {
            setPrSort((cur) => ({ ...cur, dir: flip(cur.dir) }));
          } else if (activeSection === "reviews") {
            setReviewSort((cur) => ({ ...cur, dir: flip(cur.dir) }));
          } else if (activeSection === "notifications") {
            setNotificationSort((cur) => ({ ...cur, dir: flip(cur.dir) }));
          }
        } else {
          if (activeSection === "prs") {
            setPrSort((cur) => {
              const i = PR_SORT_FIELDS.findIndex((f) => f.field === cur.field);
              const next = PR_SORT_FIELDS[(i + 1) % PR_SORT_FIELDS.length];
              return { field: next.field, dir: "desc" };
            });
          } else if (activeSection === "reviews") {
            setReviewSort((cur) => {
              const i = REVIEW_SORT_FIELDS.findIndex(
                (f) => f.field === cur.field,
              );
              const next =
                REVIEW_SORT_FIELDS[(i + 1) % REVIEW_SORT_FIELDS.length];
              return { field: next.field, dir: "desc" };
            });
          } else if (activeSection === "notifications") {
            setNotificationSort((cur) => {
              const i = NOTIFICATION_SORT_FIELDS.findIndex(
                (f) => f.field === cur.field,
              );
              const next =
                NOTIFICATION_SORT_FIELDS[
                  (i + 1) % NOTIFICATION_SORT_FIELDS.length
                ];
              return { field: next.field, dir: "desc" };
            });
          }
        }
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [queryClient]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {nav.activeSection === "prs" && (
        <Column
          section="prs"
          label="My work"
          count={sortedPrs.length}
          isActive={nav.activeSection === "prs"}
          isFetching={prs.isFetching}
          onActivate={() => {
            nav.setActiveSection("prs");
            nav.setFocusIndex(0);
          }}
          right={
            <SortControl
              fields={PR_SORT_FIELDS}
              value={prSort}
              onChange={setPrSort}
            />
          }
        >
          {prs.isLoading ? (
            <Skeleton />
          ) : prs.error ? (
            <ErrorMessage message={prs.error.message} />
          ) : (
            <PrList
              prs={sortedPrs}
              focusIndex={nav.focusIndex}
              isFocusedSection={nav.activeSection === "prs"}
              togglingDraftId={togglingDraftId ?? undefined}
            />
          )}
        </Column>
      )}

      {nav.activeSection === "reviews" && (
        <Column
          section="reviews"
          label="Reviews"
          count={itemCounts.reviews}
          isActive={nav.activeSection === "reviews"}
          isFetching={reviews.isFetching}
          onActivate={() => {
            nav.setActiveSection("reviews");
            nav.setFocusIndex(0);
          }}
          right={
            <SortControl
              fields={REVIEW_SORT_FIELDS}
              value={reviewSort}
              onChange={setReviewSort}
            />
          }
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
      )}

      {nav.activeSection === "notifications" && (
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
          right={
            <SortControl
              fields={NOTIFICATION_SORT_FIELDS}
              value={notificationSort}
              onChange={setNotificationSort}
            />
          }
        >
          {notifications.isLoading ? (
            <Skeleton />
          ) : notifications.error ? (
            <ErrorMessage message={notifications.error.message} />
          ) : (
            <NotificationList
              notifications={sortedNotifications}
              focusIndex={nav.focusIndex}
              isFocusedSection={nav.activeSection === "notifications"}
            />
          )}
        </Column>
      )}

      {actionMenu && (
        <ActionMenu
          actions={getActionsForItem(actionMenu, queryClient)}
          onClose={closeActionMenu}
        />
      )}

      {copyMenu && <CopyMenu target={copyMenu} onClose={closeCopyMenu} />}

      {panelItem &&
        panelItem.repo &&
        panelItem.number &&
        panelItem.instanceId &&
        panelItem.reviews && (
          <PrPanel
            pr={{
              title: panelItem.title,
              body: panelItem.body ?? "",
              url: panelItem.url,
              repo: panelItem.repo,
              number: panelItem.number,
              additions: panelItem.additions ?? 0,
              deletions: panelItem.deletions ?? 0,
              reviews: panelItem.reviews,
              reviewDecision: panelItem.reviewDecision,
              headBranch: panelItem.headBranch,
              baseBranch: panelItem.baseBranch,
              commentCount: panelItem.commentCount,
              author: panelItem.author,
              instanceId: panelItem.instanceId,
            }}
            onOpenActionMenu={() => openActionMenu(panelItem)}
            actionMenuOpen={!!actionMenu}
            onClose={closePanel}
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
      reviewDecision: p.reviewDecision,
      mergeStateStatus: p.mergeStateStatus,
      autoMerge: p.autoMerge,
      autoMergeAllowed: p.autoMergeAllowed,
      draft: p.draft,
      author: p.author,
      headBranch: p.headBranch,
      baseBranch: p.baseBranch,
      commentCount: p.commentCount,
      ciStatus: p.ciStatus,
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
      reviewDecision: r.reviewDecision,
      draft: r.draft,
      author: r.author,
      headBranch: r.headBranch,
      baseBranch: r.baseBranch,
      commentCount: r.commentCount,
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
  right,
  children,
}: {
  section: Section;
  label: string;
  count: number;
  isActive: boolean;
  isFetching: boolean;
  onActivate: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-4 pb-2">
        <SectionHeader
          section={section}
          label={label}
          count={count}
          isActive={isActive}
          isFetching={isFetching}
          onClick={onActivate}
          right={right}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4 scroll-pt-2 scroll-pb-2">
        {children}
      </div>
    </div>
  );
}

const SECTION_TABS: { id: Section; label: string }[] = [
  { id: "prs", label: "My Work" },
  { id: "reviews", label: "Reviews" },
  { id: "notifications", label: "Notifications" },
];

function SectionTabs() {
  const [active, setActive] = useAtom(activeSectionAtom);

  return (
    <div
      role="tablist"
      aria-label="Sections"
      className="inline-flex items-center gap-0.5 [-webkit-app-region:no-drag]"
    >
      {SECTION_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => setActive(tab.id)}
          className={cn(
            "inline-flex h-7 items-center rounded-md px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            active === tab.id
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
