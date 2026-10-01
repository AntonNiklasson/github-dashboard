import { setTimeout as sleep } from "node:timers/promises";
import clipboard from "clipboardy";
import { Box, Text, render, useInput, useWindowSize } from "ink";
import open from "open";
import { useEffect, useState } from "react";
import { actionOptions } from "./actions.js";
import { copyOptions } from "./copy.js";
import { openOptions } from "./links.js";
import { Markdown, markdownBlocks } from "./markdown.js";
import { CommentsView, commentThreads, type Thread } from "./comments.js";
import { NotificationRow } from "./notifications.js";
import { loadState, saveState, type TuiState } from "./state.js";
import { ago } from "./time.js";
import { createDemoRuntime } from "./demo.js";
import { ReviewPane } from "./review.js";
import { stackPrs, type Stacked } from "./stack.js";
import {
  compare,
  defaultSort,
  pickSort,
  sortFields,
  sortKeys,
} from "./sort.js";
import {
  createSync,
  type NormalizedPr,
  type Notification,
  type SyncKind,
  type SyncResult,
} from "sync";

type Runtime = ReturnType<typeof createSync>;
type Entry = {
  id: string;
  instanceId: string;
  label: string;
  title: string;
  repo: string;
  url: string;
  pr?: NormalizedPr;
  notification?: Notification;
};
const tabs: SyncKind[] = ["prs", "reviews", "notifications"];
type DetailTab = "description" | "comments" | "diff";
const detailTabs: DetailTab[] = ["description", "comments", "diff"];
const detailTabLabels: Record<DetailTab, string> = {
  description: "Description",
  comments: "Comments",
  diff: "Diff",
};
const tabLabels: Record<SyncKind, string> = {
  prs: "My work",
  reviews: "Requested reviews",
  notifications: "Notifications",
};
const colors = {
  success: "#4ade80",
  failure: "#fb7185",
  warning: "#fbbf24",
  muted: "#a5b4d4",
  subtle: "#64748b",
  selected: "#27334d",
  accent: "#67e8f9",
} as const;

function ciColor(status: NormalizedPr["ciStatus"]): string {
  return status === "success"
    ? colors.success
    : status === "failure"
      ? colors.failure
      : status === "pending"
        ? colors.warning
        : colors.muted;
}
function decisionColor(decision: NormalizedPr["reviewDecision"]): string {
  return decision === "APPROVED"
    ? colors.success
    : decision === "CHANGES_REQUESTED"
      ? colors.failure
      : colors.warning;
}

// Provider text is untrusted, including ANSI escape sequences and newlines.
function safe(text: string): string {
  // eslint-disable-next-line no-control-regex -- prevent terminal control sequences in provider content
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}
function shorten(text: string, width: number): string {
  const clean = safe(text);
  return clean.length > width
    ? `${clean.slice(0, Math.max(0, width - 1))}…`
    : clean;
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
// Nerd Font octicons; requires a patched terminal font.
const icons = {
  pr: "\uf407", // oct-git_pull_request
  draft: "\uf4dd", // oct-git_pull_request_draft
  check: "\uf42e", // oct-check
  x: "\uf467", // oct-x
  dot: "\uf444", // oct-dot_fill
  dotEmpty: "\uf4c3", // oct-dot
  comment: "\uf41f", // oct-comment
  clock: "\uf43a", // oct-clock
  approved: "\uf4a4", // oct-check_circle_fill
  merge: "\uf419", // oct-git_merge
  queue: "\uf4db", // oct-git_merge_queue
  repo: "\uf401", // oct-repo
} as const;
const ciGlyph: Record<NormalizedPr["ciStatus"], string> = {
  success: icons.check,
  failure: icons.x,
  pending: icons.dot,
  unknown: "",
};
// Mirrors GitHub's list subtitle: conflicts, then review state. List rows show
// draft via the icon, so drafts only surface conflicts there, and skip the
// default "Review required".
function prStatus(pr: NormalizedPr, { list = false } = {}): Status | null {
  if (pr.draft && !list) return { text: "Draft", color: colors.muted };
  if (pr.mergeStateStatus === "DIRTY" || pr.mergeable === false)
    return { text: "Conflicts", color: colors.warning, badge: true };
  if (pr.draft) return null;
  // List rows show the queue via the yellow icon and title instead.
  if (pr.inMergeQueue)
    return list
      ? null
      : { text: "In merge queue", color: colors.warning, icon: icons.queue };
  if (pr.reviewDecision === "APPROVED")
    return { text: "Approved", color: colors.success, icon: icons.approved };
  if (pr.reviewDecision === "CHANGES_REQUESTED")
    return { text: "Changes requested", color: colors.failure };
  // The default for open PRs on protected branches; only worth a line in details.
  if (pr.reviewDecision === "REVIEW_REQUIRED" && !list)
    return { text: "Review required", color: colors.warning };
  return null;
}
type Status = {
  text: string;
  color: string;
  badge?: boolean;
  icon?: string;
};
// Badges invert the status color so blocking states stand out in the row.
function StatusText({ status }: { status: Status }) {
  return status.badge ? (
    <Text bold color="black" backgroundColor={status.color}>
      {" "}
      {status.text}{" "}
    </Text>
  ) : (
    <Text bold color={status.color}>
      {status.icon && `${status.icon} `}
      {status.text}
    </Text>
  );
}
function openThreads(count: number): string {
  return `${count} open thread${count === 1 ? "" : "s"}`;
}
function LeaderMenu({
  title,
  options,
}: {
  title: string;
  options: { key: string; label: string; active?: boolean }[];
}) {
  return (
    <Text wrap="truncate-end">
      <Text bold color="cyan">
        {title}
        {"  "}
      </Text>
      {options.map((option) => (
        <Text key={option.key}>
          <Text bold color={colors.accent}>
            {option.key}
          </Text>{" "}
          <Text color={option.active ? "white" : "gray"}>{option.label}</Text>
          {"  "}
        </Text>
      ))}
      <Text color="gray">Esc cancel</Text>
    </Text>
  );
}
function Sep() {
  return <Text color={colors.muted}> · </Text>;
}

function PrRow({
  entry,
  pr,
  active,
  showAuthor,
  stack,
  width,
}: {
  entry: Entry;
  pr: NormalizedPr;
  active: boolean;
  showAuthor: boolean;
  stack: Pick<Stacked<Entry>, "depth" | "last" | "size">;
  width: number;
}) {
  // Sub-PRs hang off a tree gutter under their stack's root PR.
  const child = stack.depth === 1;
  const gutter = child
    ? {
        header: "  │ ",
        title: stack.last ? "└── " : "├── ",
        meta: stack.last ? "    " : "  │ ",
        spacer: stack.last ? " " : "  │",
      }
    : { header: "", title: "", meta: "", spacer: stack.size ? "  │" : " " };
  const status = prStatus(pr, { list: true });
  const updated = ago(pr.updatedAt);
  // Truncate the title, not the trailing CI glyph, when space runs out.
  const fixed = 4 + gutter.title.length + (ciGlyph[pr.ciStatus] ? 2 : 0);
  const title = shorten(entry.title, Math.max(20, width - fixed));
  const meta = [
    showAuthor && <Text key="author">by {safe(pr.author)}</Text>,
    status && <StatusText key="status" status={status} />,
    <Text key="changes">
      <Text color={colors.success}>+{pr.additions}</Text>
      <Text color={colors.failure}> -{pr.deletions}</Text>
    </Text>,
    updated && (
      <Text key="updated">
        {icons.clock} {updated}
      </Text>
    ),
    pr.commentCount > 0 && (
      <Text key="comments">
        {icons.comment} {pr.commentCount}
      </Text>
    ),
    pr.unresolvedThreadCount > 0 && (
      <Text key="unresolved" color={colors.warning}>
        {openThreads(pr.unresolvedThreadCount)}
      </Text>
    ),
  ].filter(Boolean);
  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        backgroundColor={active ? colors.selected : undefined}
      >
        <Text color={colors.subtle} wrap="truncate-end">
          {gutter.header}
          {"    "}#{pr.number}
          {/* Sub-PRs share their root's repo; don't repeat it. */}
          {!child && (
            <>
              {"  "}
              <Text color="white">
                {icons.repo} {safe(entry.repo)}
              </Text>
            </>
          )}
        </Text>
        <Box height={1} overflow="hidden">
          <Box flexGrow={1} flexShrink={1} overflow="hidden">
            <Text wrap="truncate-end">
              <Text color="cyan" bold>
                {active ? "❯" : " "}
              </Text>{" "}
              <Text color={colors.subtle}>{gutter.title}</Text>
              <Text
                color={
                  pr.draft
                    ? colors.muted
                    : pr.inMergeQueue
                      ? colors.warning
                      : colors.success
                }
              >
                {pr.draft
                  ? icons.draft
                  : pr.inMergeQueue
                    ? icons.queue
                    : icons.pr}
              </Text>{" "}
              <Text
                bold
                color={
                  pr.inMergeQueue ? colors.warning : active ? "cyan" : "white"
                }
              >
                {title}
              </Text>
              {ciGlyph[pr.ciStatus] && (
                <Text color={ciColor(pr.ciStatus)}>
                  {" "}
                  {ciGlyph[pr.ciStatus]}
                </Text>
              )}
            </Text>
          </Box>
        </Box>
        <Text color={colors.muted} wrap="truncate-end">
          <Text color={colors.subtle}>{gutter.meta}</Text>
          {"    "}
          {meta.flatMap((part, i) =>
            i ? [<Sep key={`sep${i}`} />, part] : [part],
          )}
        </Text>
        {/* Queued PRs are past auto-merge; the queue status says enough. */}
        {pr.autoMerge && !pr.inMergeQueue && (
          <Text wrap="truncate-end">
            <Text color={colors.subtle}>{gutter.meta}</Text>
            {"    "}
            <Text color={colors.accent}>{icons.merge} auto-merge</Text>
          </Text>
        )}
      </Box>
      <Text color={colors.subtle}>{gutter.spacer}</Text>
    </Box>
  );
}

function PrDetails({
  pr,
  width,
  maxLines,
  skip,
}: {
  pr: NormalizedPr;
  width: number;
  maxLines: number;
  skip: number;
}) {
  const status = prStatus(pr);
  return (
    <>
      <Text wrap="truncate-end">
        <Text color={colors.muted}>Status </Text>
        {status ? (
          <StatusText status={status} />
        ) : (
          <Text color={colors.muted}>Open</Text>
        )}
        <Sep />
        <Text color={colors.muted}>CI </Text>
        <Text bold color={ciColor(pr.ciStatus)}>
          {ciGlyph[pr.ciStatus]} {safe(pr.ciStatus)}
        </Text>
        <Sep />
        <Text
          color={pr.unresolvedThreadCount ? colors.warning : colors.success}
        >
          {openThreads(pr.unresolvedThreadCount)}
        </Text>
        <Sep />
        {pr.commentCount} comments
      </Text>
      <Text wrap="truncate-end">
        <Text color={colors.muted}>Author </Text>
        {safe(pr.author)}
        <Text color={colors.muted}> opened {ago(pr.createdAt)}</Text>
        <Text color={colors.muted}> · updated {ago(pr.updatedAt)}</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text color={colors.muted}>Branch </Text>
        <Text color={colors.accent}>{safe(pr.headBranch)}</Text>
        <Text color={colors.muted}> → {safe(pr.baseBranch)}</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text color={colors.muted}>Changes </Text>
        <Text bold color={colors.success}>
          +{pr.additions}
        </Text>
        <Text color={colors.muted}> / </Text>
        <Text bold color={colors.failure}>
          -{pr.deletions}
        </Text>
        <Text color={colors.muted}> · {pr.commits} commits</Text>
      </Text>
      <Text wrap="truncate-end">
        <Text color={colors.muted}>Reviews </Text>
        <Text color={decisionColor(pr.reviewDecision)}>
          {safe(pr.reviewDecision ?? "none")}
        </Text>
        {pr.reviews?.approved.length ? (
          <Text color={colors.success}>
            {" "}
            {icons.check} {pr.reviews.approved.map(safe).join(", ")}
          </Text>
        ) : null}
        {pr.reviews?.changesRequested.length ? (
          <Text color={colors.failure}>
            {" "}
            {icons.x} {pr.reviews.changesRequested.map(safe).join(", ")}
          </Text>
        ) : null}
      </Text>
      {pr.labels?.length ? (
        <Text wrap="truncate-end">
          <Text color={colors.muted}>Labels </Text>
          <Text color={colors.accent}>{pr.labels.map(safe).join(", ")}</Text>
        </Text>
      ) : null}
      {/* Status already shows the merge queue; auto-merge is moot there. */}
      {pr.autoMerge && !pr.inMergeQueue && (
        <Text color={colors.accent}>{icons.merge} auto-merge enabled</Text>
      )}
      <Text> </Text>
      {/* Wrapped Markdown has no fixed line count; clip to the space left. */}
      <Box
        width={width}
        height={Math.max(1, maxLines)}
        overflow="hidden"
        flexDirection="column"
        flexShrink={0}
      >
        <Markdown source={pr.body ?? ""} skip={skip} />
      </Box>
    </>
  );
}

// Lines per list entry: header, title, meta (+ auto-merge for PRs) and a spacer.
function rowHeight(row: Stacked<Entry>): number {
  if (!row.entry.pr) return 4;
  const { autoMerge, inMergeQueue } = row.entry.pr;
  return 4 + (autoMerge && !inMergeQueue ? 1 : 0);
}
// Smallest start that still fits the selection, then as many rows as fit.
function scrollWindow(heights: number[], selected: number, budget: number) {
  let start = selected;
  let used = heights[selected] ?? 0;
  while (start > 0 && used + heights[start - 1]! <= budget)
    used += heights[--start]!;
  let end = selected + 1;
  while (end < heights.length && used + heights[end]! <= budget)
    used += heights[end++]!;
  return { start: Math.max(0, start), end: Math.max(end, start + 1) };
}
function itemsFor(
  runtime: Runtime,
  tab: SyncKind,
  instanceId: string | null,
): Entry[] {
  return runtime
    .listInstances()
    .filter((instance) => !instanceId || instance.id === instanceId)
    .flatMap<Entry>((instance) => {
      if (tab === "notifications")
        return runtime.listNotifications(instance.id).map((notification) => ({
          id: `${instance.id}/notifications/${notification.id}`,
          instanceId: instance.id,
          label: instance.label,
          title: notification.title,
          repo: notification.repo,
          url: notification.url,
          notification,
        }));
      return runtime.listPullRequests(instance.id, tab).map((pr) => ({
        id: `${instance.id}/${tab}/${pr.id}`,
        instanceId: instance.id,
        label: instance.label,
        title: pr.title,
        repo: pr.repo,
        url: pr.url,
        pr,
      }));
    });
}

export function Dashboard({
  runtime,
  cycle,
  error,
  syncing,
  stopping = false,
  initialKind = "prs",
  initialInstanceId,
  initialSorts = defaultSort,
  onStateChange,
  onRefresh,
  onQuit,
  onOpen = open,
  onCopy = (text: string) => clipboard.write(text),
}: {
  runtime: Runtime;
  cycle: SyncResult | null;
  error: string | null;
  syncing: boolean;
  stopping?: boolean;
  initialKind?: SyncKind;
  initialInstanceId?: string;
  initialSorts?: TuiState["sorts"];
  /** Called when remembered UI state (sort, view, instance) changes. */
  onStateChange?: (state: TuiState) => void;
  onRefresh: () => void;
  onQuit: () => void;
  onOpen?: (url: string) => Promise<unknown>;
  onCopy?: (text: string) => Promise<unknown>;
}) {
  const { columns, rows: height } = useWindowSize();
  const width = columns || 80;
  const rows = height || 24;
  const [tab, setTab] = useState<SyncKind>(initialKind);
  const [chosenInstance, setInstanceId] = useState<string | null>(
    initialInstanceId ?? null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [help, setHelp] = useState(false);
  const [detail, setDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("description");
  // Scroll position in the details tab, in Markdown blocks or comment threads.
  const [scroll, setScroll] = useState(0);
  const [comments, setComments] = useState<
    Record<string, { threads?: Thread[]; error?: string }>
  >({});
  const [message, setMessage] = useState("");
  const [sorts, setSorts] = useState(initialSorts);
  // Notifications marked done (entry id → when), hidden until new activity.
  const [done, setDone] = useState<Record<string, number>>({});
  // Leader-key menus: `s` / `y` / `i`, then an option key; anything else cancels.
  const [menu, setMenu] = useState<
    "sort" | "copy" | "instance" | "open" | "action" | null
  >(null);
  // Footer prompt; Enter or y runs it (plus `also`, e.g. q for quit).
  const [confirm, setConfirm] = useState<{
    prompt: string;
    also?: string;
    run: () => void;
  } | null>(null);
  // Optimistic PR fields after an action, until a resync catches up (GitHub's
  // search index lags a few seconds behind writes).
  const [overrides, setOverrides] = useState<
    Record<string, { at: number; fields: Partial<NormalizedPr> }>
  >({});
  const instances = runtime.listInstances();
  // One instance at a time; fall back to the first configured one.
  const instanceId =
    instances.find((instance) => instance.id === chosenInstance)?.id ??
    instances[0]?.id ??
    null;
  const prKey = (instance: string, pr: NormalizedPr) =>
    `${instance}/${pr.repo}#${pr.number}`;
  const available = itemsFor(runtime, tab, instanceId)
    .filter((entry) => {
      const at = done[entry.id];
      return !at || Date.parse(entry.notification?.updatedAt ?? "") > at;
    })
    .map((entry) => {
      const override = entry.pr && overrides[prKey(entry.instanceId, entry.pr)];
      return override && Date.now() - override.at < 60_000
        ? { ...entry, pr: { ...entry.pr!, ...override.fields } }
        : entry;
    });
  const sort = sorts[tab];
  const filtered = available
    .filter((item) =>
      `${item.repo} ${item.title} ${item.label}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => compare(a, b, sort));
  // Display order: stacked PRs follow their root, so navigation walks the tree.
  const listed = stackPrs(filtered);
  const position = selectedId
    ? listed.findIndex((row) => row.entry.id === selectedId)
    : -1;
  const selected = Math.min(
    position >= 0 ? position : index,
    Math.max(0, listed.length - 1),
  );
  const item = listed[selected]?.entry;
  // Details: PRs get Description / Comments / Diff tabs; notifications don't.
  const tabbed = detail && !!item?.pr;
  const activeDetailTab: DetailTab = tabbed ? detailTab : "description";
  const itemKey = item?.pr ? prKey(item.instanceId, item.pr) : null;
  const itemComments = itemKey ? comments[itemKey] : undefined;
  const scrollMax =
    activeDetailTab === "comments"
      ? Math.max(0, (itemComments?.threads?.length ?? 1) - 1)
      : Math.max(0, markdownBlocks(item?.pr?.body ?? "") - 1);
  const openDetailTab = (next: DetailTab) => {
    setDetailTab(next);
    setScroll(0);
  };
  const cycleDetailTab = (direction: 1 | -1) => {
    const next = detailTabs.indexOf(activeDetailTab) + direction;
    openDetailTab(detailTabs[(next + detailTabs.length) % detailTabs.length]!);
  };

  useEffect(() => {
    onStateChange?.({ sorts, kind: tab, instanceId: instanceId ?? undefined });
  }, [sorts, tab, instanceId]);

  // Comments load on demand when their tab opens, once per PR (r refetches).
  useEffect(() => {
    if (activeDetailTab !== "comments" || !item?.pr || !itemKey) return;
    if (comments[itemKey]) return;
    setComments((current) => ({ ...current, [itemKey]: {} }));
    runtime
      .getPullRequestComments({
        instanceId: item.instanceId,
        repo: item.pr.repo,
        number: item.pr.number,
      })
      .then(
        (list) => commentThreads(list),
        (err: unknown) => errorMessage(err),
      )
      .then((result) =>
        setComments((current) => ({
          ...current,
          [itemKey]:
            typeof result === "string"
              ? { error: result }
              : { threads: result },
        })),
      );
  }, [activeDetailTab, itemKey]);

  const count = (kind: SyncKind) => itemsFor(runtime, kind, instanceId).length;
  const failures =
    cycle?.results.flatMap((result) =>
      result.fetches
        .filter(
          (fetch) => fetch.status === "failed" || fetch.status === "skipped",
        )
        .map(
          (fetch) =>
            `${result.instanceId}/${fetch.kind} ${fetch.status}${fetch.reason ? `: ${fetch.reason}` : ""}`,
        ),
    ) ?? [];
  // Routine sync state lives in the top bar's SYNCING / READY; the status line
  // only appears for things worth reading.
  const status = stopping
    ? "Quitting…"
    : error
      ? `Sync error: ${error}`
      : failures.join(" | ");
  const statusText = message || status;
  const footerLines = statusText ? 2 : 1;
  // Scroll window by actual row heights. Chrome: the top bar, the sort line,
  // and the footer (key hints, plus the status line when it has content).
  const budget = Math.max(1, rows - 2 - footerLines);
  const { start, end } = scrollWindow(listed.map(rowHeight), selected, budget);
  const visible = Math.max(1, end - start);
  const instanceOptions: { id: string | null; label: string }[] =
    instances.length ? instances : [{ id: null, label: "No instances" }];
  const activeInstance = instanceId;
  // Instances share the top bar with the view tabs and sync status: show
  // them all when they fit, else just the active one with ‹ › hints.
  const tabWidth = 20;
  const viewTabsWidth = tabs.reduce(
    (sum, kind) =>
      sum + tabLabels[kind].length + String(count(kind)).length + 3,
    0,
  );
  const instancesWidth = instanceOptions.reduce(
    (sum, instance) => sum + Math.min(instance.label.length, tabWidth - 5) + 3,
    0,
  );
  const activeTabIndex = Math.max(
    0,
    instanceOptions.findIndex((i) => i.id === activeInstance),
  );
  const fitsAll = instancesWidth <= width - viewTabsWidth - 14;
  const firstTab = fitsAll ? 0 : activeTabIndex;
  const tabCount = fitsAll ? instanceOptions.length : 1;
  const visibleTabs = instanceOptions.slice(firstTab, firstTab + tabCount);
  const changed = (kind: SyncKind) => {
    setTab(kind);
    setIndex(0);
    setSelectedId(null);
    setDetail(false);
  };
  const selectInstance = (id: string | null) => {
    setInstanceId(id);
    setIndex(0);
    setSelectedId(null);
    setDetail(false);
  };
  const chooseInstance = (direction: number) => {
    const ids = instances.map((i) => i.id);
    if (!ids.length) return;
    const current = instanceId ? ids.indexOf(instanceId) : 0;
    selectInstance(ids[(current + direction + ids.length) % ids.length]!);
  };
  const instanceMenu = instances.slice(0, 9).map((instance, i) => ({
    key: String(i + 1),
    label: instance.label,
    active: instance.id === instanceId,
    id: instance.id,
  }));
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(listed.length - 1, selected + delta));
    setIndex(next);
    setSelectedId(listed[next]?.entry.id ?? null);
  };
  const copies = item ? copyOptions(item, runtime) : [];
  const copy = (option: (typeof copies)[number]) => {
    void Promise.resolve()
      .then(option.value)
      .then(onCopy)
      .then(() => setMessage(`Copied ${option.label}`))
      .catch((err: unknown) =>
        setMessage(`Copy ${option.label} failed: ${errorMessage(err)}`),
      );
  };
  const opens = item ? openOptions(item) : [];
  const actions = item ? actionOptions(item, tab, runtime) : [];
  // Optimistic like PR actions: hide now, restore if GitHub rejects it.
  const markDone = (target: Entry) => {
    const id = target.notification!.id;
    setDone((current) => ({ ...current, [target.id]: Date.now() }));
    setMessage("");
    runtime
      .markNotificationDone({ instanceId: target.instanceId, id })
      .then(onRefresh, (err: unknown) => {
        setDone(({ [target.id]: _failed, ...rest }) => rest);
        setMessage(
          `Mark done failed: ${errorMessage(err)} · ${safe(target.title)}`,
        );
      });
  };
  // Optimistic: show the expected state now, run the action in the
  // background, and roll back if GitHub rejects it.
  const perform = (option: (typeof actions)[number]) => {
    const target = item;
    if (!target?.pr) return;
    const key = prKey(target.instanceId, target.pr);
    const previous = overrides[key];
    const apply = (fields: Partial<NormalizedPr>) =>
      setOverrides((current) => ({
        ...current,
        [key]: {
          at: Date.now(),
          fields: { ...current[key]?.fields, ...fields },
        },
      }));
    apply(option.optimistic);
    setMessage("");
    void option
      .run()
      .then((fields) => {
        apply(fields);
        onRefresh();
      })
      .catch((err: unknown) => {
        setOverrides(({ [key]: _failed, ...rest }) =>
          previous ? { ...rest, [key]: previous } : rest,
        );
        setMessage(
          `${option.label} failed: ${errorMessage(err)} · ${safe(target.title)}`,
        );
      });
  };

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        onQuit();
        return;
      }
      if (confirm) {
        setConfirm(null);
        if (
          key.return ||
          input === "y" ||
          (confirm.also && input === confirm.also)
        )
          confirm.run();
        return;
      }
      if (help) {
        setHelp(false);
        return;
      }
      if (menu) {
        setMenu(null);
        if (menu === "sort") {
          const next = pickSort(tab, sort, input);
          if (next) setSorts((current) => ({ ...current, [tab]: next }));
        } else if (menu === "open") {
          const option = opens.find((candidate) => candidate.key === input);
          if (option)
            void onOpen(option.url)
              .then(() => setMessage(`Opened ${option.label}`))
              .catch((err: unknown) =>
                setMessage(`Open failed: ${errorMessage(err)}`),
              );
        } else if (menu === "action") {
          const option = actions.find((candidate) => candidate.key === input);
          if (option) {
            if (option.confirm)
              setConfirm({
                prompt: option.confirm,
                run: () => perform(option),
              });
            else perform(option);
          }
        } else if (menu === "instance") {
          const option = instanceMenu.find(
            (candidate) => candidate.key === input,
          );
          if (option) selectInstance(option.id);
        } else {
          const option = copies.find((candidate) => candidate.key === input);
          if (option) copy(option);
        }
        return;
      }
      if (searching) {
        if (key.escape) {
          setQuery("");
          setSearching(false);
        } else if (key.return) setSearching(false);
        else if (key.backspace || key.delete) {
          setQuery((value) => value.slice(0, -1));
          setIndex(0);
          setSelectedId(null);
        } else if (input && !key.ctrl && !key.meta) {
          setQuery((value) => value + safe(input));
          setIndex(0);
          setSelectedId(null);
        }
        return;
      }
      if (input === "q")
        setConfirm({ prompt: "Quit?", also: "q", run: onQuit });
      else if (input === "?") setHelp(true);
      else if (input === "/") {
        setSearching(true);
        setQuery("");
        setIndex(0);
        setSelectedId(null);
      } else if (key.escape) {
        if (detail) {
          setDetail(false);
          setScroll(0);
        } else {
          setQuery("");
          setMessage("");
        }
      } else if (input === "r") {
        // Refetch the open PR's comments too, not just the synced lists.
        if (itemKey) setComments(({ [itemKey]: _stale, ...rest }) => rest);
        onRefresh();
      } else if (input === "s") setMenu("sort");
      else if (input === "S")
        setSorts((current) => ({
          ...current,
          [tab]: { ...sort, dir: sort.dir === "asc" ? "desc" : "asc" },
        }));
      else if (input === "o") {
        if (opens.length) setMenu("open");
        else setMessage("No valid URL for selected item");
      } else if (input === ".") {
        if (actions.length) setMenu("action");
        else setMessage("No actions for selected item");
      } else if (input === "y") {
        if (copies.length) setMenu("copy");
        else setMessage("Nothing to copy for selected item");
      } else if (detail && (key.upArrow || input === "k"))
        setScroll((value) => Math.max(0, value - 1));
      else if (detail && (key.downArrow || input === "j"))
        setScroll((value) => Math.min(scrollMax, value + 1));
      else if (key.upArrow || input === "k") move(-1);
      else if (key.downArrow || input === "j") move(1);
      else if (key.pageDown) move(visible);
      else if (key.pageUp) move(-visible);
      else if (key.return && !detail && item?.notification) {
        const url = openOptions(item)[0]?.url;
        if (url)
          void onOpen(url).catch((err: unknown) =>
            setMessage(`Open failed: ${errorMessage(err)}`),
          );
        else setMessage("No valid URL for selected item");
      } else if (input === "e" && !detail && item?.notification) markDone(item);
      else if (key.return && !detail && item) {
        setDetail(true);
        openDetailTab("description");
      } else if ((key.return || input === "d") && tabbed) openDetailTab("diff");
      else if (input === "[" || key.leftArrow) chooseInstance(-1);
      else if (input === "]" || key.rightArrow) chooseInstance(1);
      else if (input === "i" && instances.length > 1) setMenu("instance");
      else if (key.tab && tabbed) cycleDetailTab(key.shift ? -1 : 1);
      else if (key.tab) {
        const next = tabs.indexOf(tab) + (key.shift ? -1 : 1);
        changed(tabs[(next + tabs.length) % tabs.length]!);
      } else if (["1", "2", "3"].includes(input) && tabbed)
        openDetailTab(detailTabs[Number(input) - 1]!);
      else if (["1", "2", "3"].includes(input))
        changed(tabs[Number(input) - 1]!);
    },
    // The diff tab's ReviewPane owns input (it hands Tab back via onTab).
    { isActive: !(tabbed && activeDetailTab === "diff") },
  );

  if (rows < 16 || width < 40)
    return (
      <Box flexDirection="column">
        <Text color="cyan">GitHub Dashboard</Text>
        <Text>Terminal needs at least 40×16. Press q to quit.</Text>
      </Box>
    );

  return (
    <Box width={width} height={rows} flexDirection="column">
      {/* One top bar: views on the left, instances and sync state on the right. */}
      <Box justifyContent="space-between" paddingX={1}>
        <Box gap={2}>
          {tabs.map((kind) => (
            <Text
              key={kind}
              bold={tab === kind}
              color={tab === kind ? "cyan" : "gray"}
            >
              {tabLabels[kind]} {count(kind)}
            </Text>
          ))}
        </Box>
        <Box gap={1}>
          {firstTab > 0 && <Text color="gray">‹</Text>}
          {visibleTabs.map((instance) => (
            <Text
              key={instance.id ?? "none"}
              bold={activeInstance === instance.id}
              color={activeInstance === instance.id ? "black" : "gray"}
              backgroundColor={
                activeInstance === instance.id ? "cyan" : undefined
              }
            >
              {activeInstance === instance.id ? "●" : "○"}{" "}
              {shorten(instance.label, tabWidth - 5)}
            </Text>
          ))}
          {firstTab + tabCount < instanceOptions.length && (
            <Text color="gray">›</Text>
          )}
          <Text color={syncing ? "yellow" : "green"}>
            {"  "}
            {syncing ? "● SYNCING" : "● READY"}
          </Text>
        </Box>
      </Box>
      <Box flexGrow={1} flexDirection="row">
        {help ? (
          <Box
            flexGrow={1}
            borderStyle="round"
            borderColor="cyan"
            flexDirection="column"
            paddingX={2}
          >
            <Text bold color="cyan">
              KEYBOARD SHORTCUTS
            </Text>
            <Text>
              Tab / Shift-Tab Switch My work, Requested reviews, Notifications
            </Text>
            <Text>
              1 / 2 / 3 Switch My work, Requested reviews, Notifications
            </Text>
            <Text>i then 1-9 / [ ] Switch instance</Text>
            <Text>j / k or ↑ / ↓ Select item; PgUp / PgDn scroll</Text>
            <Text>
              / Search title, repository or instance; Enter applies, Esc clears
            </Text>
            <Text>o then key Open PR, checks, diff, author's PRs or repo</Text>
            <Text>
              . then key Actions: toggle draft, toggle auto-merge, approve
            </Text>
            <Text>
              y then key Copy number, URL, branch, review request or files
            </Text>
            <Text>
              s then key Sort by field (again flips); S flips direction
            </Text>
            <Text>r Refresh (queued after any active fetch)</Text>
            <Text>q Quit (Enter, y or q again confirms; Ctrl-C quits now)</Text>
            <Text>Enter Show PR details; Enter / d again reviews the diff</Text>
            <Text>Notifications: Enter opens in browser, e marks done</Text>
            <Text>Esc Back to list / clear filter</Text>
            <Text> </Text>
            <Text color="gray">Press any key to close help</Text>
          </Box>
        ) : detail && item?.pr ? (
          <Box
            flexGrow={1}
            overflow="hidden"
            flexDirection="column"
            paddingX={1}
          >
            <Text bold wrap="truncate-end">
              {item.pr && <Text color={colors.muted}>#{item.pr.number} </Text>}
              {safe(item.title)}
            </Text>
            <Text color={colors.muted} wrap="truncate-end">
              {safe(item.repo)}
            </Text>
            {tabbed && (
              <Box gap={2}>
                {detailTabs.map((name) => (
                  <Text
                    key={name}
                    bold={name === activeDetailTab}
                    color={name === activeDetailTab ? "cyan" : "gray"}
                  >
                    {detailTabLabels[name]}
                    {name === "comments" && item.pr!.commentCount
                      ? ` ${item.pr!.commentCount}`
                      : ""}
                  </Text>
                ))}
              </Box>
            )}
            <Text> </Text>
            {item.pr && activeDetailTab === "diff" ? (
              <ReviewPane
                key={itemKey}
                runtime={runtime}
                instanceId={item.instanceId}
                pr={item.pr}
                onBack={() => {
                  setDetail(false);
                  setScroll(0);
                }}
                onQuit={onQuit}
                onTab={cycleDetailTab}
              />
            ) : item.pr && activeDetailTab === "comments" ? (
              itemComments?.threads ? (
                <CommentsView threads={itemComments.threads} skip={scroll} />
              ) : itemComments?.error ? (
                <Text color={colors.failure}>
                  Couldn't load comments: {itemComments.error}
                </Text>
              ) : (
                <Text color={colors.muted}>Loading comments…</Text>
              )
            ) : item.pr ? (
              <PrDetails
                pr={item.pr}
                width={width - 2}
                // Chrome (3) + header with tabs (4) + fixed detail lines (9).
                maxLines={rows - 15 - footerLines}
                skip={scroll}
              />
            ) : null}
          </Box>
        ) : (
          <Box
            flexGrow={1}
            overflow="hidden"
            flexDirection="column"
            paddingX={1}
          >
            <Box justifyContent="space-between">
              {/* The tab bar already names the view and its count. */}
              <Text color={colors.muted}>
                {query ? `${filtered.length} of ${available.length} match` : ""}
              </Text>
              <Text color={colors.muted}>
                {sort.field} {sort.dir === "asc" ? "↑" : "↓"}
              </Text>
            </Box>
            {filtered.length ? (
              listed.slice(start, end).map((row, offset) => {
                const { entry } = row;
                const active = start + offset === selected;
                return entry.pr ? (
                  <PrRow
                    key={entry.id}
                    entry={entry}
                    pr={entry.pr}
                    active={active}
                    // Every row in "My work" is yours; skip the redundant author.
                    showAuthor={tab !== "prs"}
                    stack={row}
                    width={width - 2}
                  />
                ) : entry.notification ? (
                  <NotificationRow
                    key={entry.id}
                    repo={entry.repo}
                    notification={entry.notification}
                    active={active}
                  />
                ) : null;
              })
            ) : (
              <Text color="gray">
                {query
                  ? "No matches · Esc clears search"
                  : "No cached items · r refreshes"}
              </Text>
            )}
          </Box>
        )}
      </Box>
      {statusText && (
        <Box paddingX={1}>
          <Text
            color={error || failures.length ? "yellow" : "gray"}
            wrap="truncate-end"
          >
            {shorten(statusText, width - 3)}
          </Text>
        </Box>
      )}
      <Box paddingX={1}>
        {confirm ? (
          <Text wrap="truncate-end">
            <Text bold color={colors.warning}>
              {confirm.prompt.toUpperCase()}
              {"  "}
            </Text>
            <Text color="gray">
              Enter / y{confirm.also ? ` / ${confirm.also}` : ""} confirm · any
              other key cancels
            </Text>
          </Text>
        ) : menu ? (
          <LeaderMenu
            title={menu.toUpperCase()}
            options={
              menu === "open"
                ? opens
                : menu === "action"
                  ? actions
                  : menu === "instance"
                    ? instanceMenu
                    : menu === "sort"
                      ? sortFields[tab].map((field) => ({
                          key: sortKeys[field],
                          label:
                            field === sort.field
                              ? `${field} ${sort.dir === "asc" ? "↑" : "↓"}`
                              : field,
                          active: field === sort.field,
                        }))
                      : copies
            }
          />
        ) : (
          <Text color="gray" wrap="truncate-end">
            {tabbed && activeDetailTab === "diff"
              ? "DIFF  Tab/Shift-Tab switch tab · Esc back to list"
              : searching
                ? `SEARCH /${query}█  Enter apply · Esc cancel`
                : help
                  ? "HELP  Tab/Shift-Tab views · i/[ ] instance · j/k move · / search · o open · y copy · r refresh · q quit · any key closes"
                  : detail
                    ? tabbed
                      ? "DETAILS  Tab/1-3 tabs · j/k scroll · o open · . actions · y copy · Esc back"
                      : "DETAILS  o open · y copy · Esc back"
                    : tab === "notifications"
                      ? "Tab views  i instance  Enter open in browser  e done  s sort  y copy  / search  ? help  q quit"
                      : "Tab views  i instance  Enter details  o open  . actions  s sort  y copy  / search  ? help  q quit"}
          </Text>
        )}
      </Box>
    </Box>
  );
}

export async function runTui(options: {
  instanceId?: string;
  kind?: SyncKind;
  intervalMs: number;
  demo?: boolean;
}): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("tui requires an interactive terminal");
  const runtime = options.demo ? createDemoRuntime() : createSync();
  // Remembered sort, view and instance; CLI flags win. Demo mode never writes.
  const saved = options.demo ? undefined : loadState();
  const remembered = {
    initialKind: options.kind ?? saved?.kind,
    initialInstanceId: options.instanceId ?? saved?.instanceId,
    initialSorts: saved?.sorts,
    onStateChange: options.demo ? undefined : saveState,
  };
  const abort = new AbortController();
  let refresh = false;
  let wake: (() => void) | null = null;
  let cycle: SyncResult | null = null;
  let error: string | null = null;
  let syncing = false;
  let app: ReturnType<typeof render> | undefined;
  let crash: unknown;
  const quit = () => {
    abort.abort();
    wake?.();
    update();
  };
  const update = () =>
    app?.rerender(
      <Dashboard
        runtime={runtime}
        cycle={cycle}
        error={error}
        syncing={syncing}
        stopping={abort.signal.aborted}
        {...remembered}
        onRefresh={() => {
          refresh = true;
          wake?.();
        }}
        onQuit={quit}
      />,
    );
  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
  try {
    app = render(
      <Dashboard
        runtime={runtime}
        cycle={null}
        error={null}
        syncing={false}
        {...remembered}
        onRefresh={() => {
          refresh = true;
          wake?.();
        }}
        onQuit={quit}
      />,
      { alternateScreen: true, exitOnCtrlC: false, patchConsole: false },
    );
    // Ink unmounts on render errors; stop syncing instead of running headless,
    // and rethrow so the error isn't lost with the alternate screen.
    app.waitUntilExit().then(
      () => {
        if (!abort.signal.aborted) quit();
      },
      (err: unknown) => {
        crash = err;
        quit();
      },
    );
    // Quitting doesn't wait for an in-flight fetch: snapshots are written in
    // single transactions, so an abandoned fetch is simply not persisted.
    const aborted = new Promise<null>((resolve) =>
      abort.signal.addEventListener("abort", () => resolve(null), {
        once: true,
      }),
    );
    while (!abort.signal.aborted) {
      refresh = false;
      syncing = true;
      update();
      const outcome = await Promise.race([
        runtime.sync({ instanceId: options.instanceId }).then(
          (result) => ({ result }),
          (err: unknown) => ({ err }),
        ),
        aborted,
      ]);
      if (!outcome) break;
      if ("result" in outcome) {
        cycle = outcome.result;
        error = null;
      } else error = errorMessage(outcome.err);
      syncing = false;
      update();
      if (abort.signal.aborted || refresh) continue;
      const controller = new AbortController();
      wake = () => controller.abort();
      try {
        await sleep(options.intervalMs, undefined, {
          signal: controller.signal,
        });
      } catch {
        /* refresh or shutdown */
      }
      wake = null;
    }
    if (crash) throw crash;
    return 0;
  } finally {
    abort.abort();
    process.off("SIGINT", quit);
    process.off("SIGTERM", quit);
    app?.unmount();
    // Give cleanup a moment, but never make quitting wait on the network.
    await Promise.race([
      runtime.close(),
      new Promise((resolve) => setTimeout(resolve, 300).unref()),
    ]);
  }
}
