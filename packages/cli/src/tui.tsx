import { setTimeout as sleep } from "node:timers/promises";
import clipboard from "clipboardy";
import { Box, Text, render, useInput, useWindowSize } from "ink";
import open from "open";
import { useState } from "react";
import { copyOptions } from "./copy.js";
import { Markdown } from "./markdown.js";
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
function ago(iso: string | undefined, now = Date.now()): string {
  const then = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
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
  instance: "\uf473", // oct-server
  repo: "\uf401", // oct-repo
} as const;
const ciGlyph: Record<NormalizedPr["ciStatus"], string> = {
  success: icons.check,
  failure: icons.x,
  pending: icons.dot,
  unknown: "",
};
// Mirrors GitHub's list subtitle: conflicts, then review state. List rows show
// draft via the icon, so drafts only surface conflicts there.
function prStatus(pr: NormalizedPr, { list = false } = {}): Status | null {
  if (pr.draft && !list) return { text: "Draft", color: colors.muted };
  if (pr.mergeStateStatus === "DIRTY" || pr.mergeable === false)
    return { text: "Conflicts", color: colors.warning, badge: true };
  if (pr.draft) return null;
  if (pr.inMergeQueue) return { text: "In merge queue", color: colors.accent };
  if (pr.reviewDecision === "APPROVED")
    return { text: "Approved", color: colors.success };
  if (pr.reviewDecision === "CHANGES_REQUESTED")
    return { text: "Changes requested", color: colors.failure };
  if (pr.reviewDecision === "REVIEW_REQUIRED")
    return { text: "Review required", color: colors.warning };
  return null;
}
type Status = { text: string; color: string; badge?: boolean };
// Badges invert the status color so blocking states stand out in the row.
function StatusText({ status }: { status: Status }) {
  return status.badge ? (
    <Text bold color="black" backgroundColor={status.color}>
      {" "}
      {status.text}{" "}
    </Text>
  ) : (
    <Text bold color={status.color}>
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
    pr.autoMerge && (
      <Text key="auto" color={colors.accent}>
        auto-merge
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
          {/* Sub-PRs share their root's instance and repo; don't repeat them. */}
          {!child && (
            <>
              {"  "}
              {icons.instance} {safe(entry.label)}
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
              <Text color={pr.draft ? colors.muted : colors.success}>
                {pr.draft ? icons.draft : icons.pr}
              </Text>{" "}
              <Text bold color={active ? "cyan" : "white"}>
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
      </Box>
      <Text color={colors.subtle}>{gutter.spacer}</Text>
    </Box>
  );
}

function PrDetails({
  pr,
  width,
  maxLines,
}: {
  pr: NormalizedPr;
  width: number;
  maxLines: number;
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
      {(pr.autoMerge || pr.inMergeQueue) && (
        <Text color={colors.accent}>
          {[
            pr.autoMerge && "auto-merge enabled",
            pr.inMergeQueue && "in merge queue",
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
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
        <Markdown source={pr.body ?? ""} />
      </Box>
    </>
  );
}

function NotificationRow({
  entry,
  notification,
  active,
  showInstance,
}: {
  entry: Entry;
  notification: Notification;
  active: boolean;
  showInstance: boolean;
}) {
  const updated = ago(notification.updatedAt);
  return (
    <Box
      flexDirection="column"
      backgroundColor={active ? colors.selected : undefined}
    >
      <Text wrap="truncate-end">
        <Text color="cyan" bold>
          {active ? "❯" : " "}
        </Text>{" "}
        <Text color={notification.unread ? colors.accent : colors.muted}>
          {notification.unread ? icons.dot : icons.dotEmpty}
        </Text>{" "}
        <Text color={colors.muted}>{safe(entry.repo)}</Text>{" "}
        <Text bold={notification.unread} color={active ? "cyan" : "white"}>
          {safe(entry.title)}
        </Text>
      </Text>
      <Text color={colors.muted} wrap="truncate-end">
        {"    "}
        {safe(notification.reason)}
        {notification.type && (
          <>
            <Sep />
            {safe(notification.type)}
          </>
        )}
        {updated && (
          <>
            <Sep />
            {icons.clock} {updated}
          </>
        )}
        {showInstance && (
          <>
            <Sep />
            <Text color={colors.subtle}>
              {icons.instance} {safe(entry.label)}
            </Text>
          </>
        )}
      </Text>
    </Box>
  );
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
  onRefresh: () => void;
  onQuit: () => void;
  onOpen?: (url: string) => Promise<unknown>;
  onCopy?: (text: string) => Promise<unknown>;
}) {
  const { columns, rows: height } = useWindowSize();
  const width = columns || 80;
  const rows = height || 24;
  const [tab, setTab] = useState<SyncKind>(initialKind);
  const [instanceId, setInstanceId] = useState<string | null>(
    initialInstanceId ?? null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [help, setHelp] = useState(false);
  const [detail, setDetail] = useState(false);
  const [review, setReview] = useState<Entry | null>(null);
  const [message, setMessage] = useState("");
  const [sorts, setSorts] = useState(defaultSort);
  // Leader-key menus: `s` / `y`, then an option key; anything else cancels.
  const [menu, setMenu] = useState<"sort" | "copy" | null>(null);
  const instances = runtime.listInstances();
  const available = itemsFor(runtime, tab, instanceId);
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
  const count = (kind: SyncKind) => itemsFor(runtime, kind, instanceId).length;
  // PR entries take three lines plus a spacer, notifications two. Keep the footer visible.
  const visible = Math.max(
    1,
    Math.floor((rows - 10) / (tab === "notifications" ? 2 : 4)),
  );
  const start = Math.max(0, selected - visible + 1);
  const instanceOptions =
    instances.length > 1
      ? [{ id: null, label: "All" }, ...instances]
      : instances.length
        ? instances
        : [{ id: null, label: "No instances" }];
  const activeInstance =
    instanceId ?? (instances.length === 1 ? instances[0]!.id : null);
  // Fit tabs on one row; keep the active one visible when many hosts exist.
  const tabWidth = 20;
  const tabCount = Math.max(1, Math.floor((width - 4) / tabWidth));
  const activeTabIndex = Math.max(
    0,
    instanceOptions.findIndex((i) => i.id === activeInstance),
  );
  const firstTab = Math.min(
    Math.max(0, activeTabIndex - tabCount + 1),
    Math.max(0, instanceOptions.length - tabCount),
  );
  const visibleTabs = instanceOptions.slice(firstTab, firstTab + tabCount);
  const changed = (kind: SyncKind) => {
    setTab(kind);
    setIndex(0);
    setSelectedId(null);
    setDetail(false);
  };
  const chooseInstance = (direction: number) => {
    const ids = instanceOptions.map((i) => i.id);
    setInstanceId(
      ids[(ids.indexOf(instanceId) + direction + ids.length) % ids.length]!,
    );
    setIndex(0);
    setSelectedId(null);
    setDetail(false);
  };
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
  const act = (action: (url: string) => Promise<unknown>, verb: string) => {
    if (!item || !/^https?:\/\//i.test(item.url)) {
      setMessage("No valid URL for selected item");
      return;
    }
    void action(item.url)
      .then(() => setMessage(`${verb}: ${safe(item.title)}`))
      .catch((err: unknown) =>
        setMessage(`${verb} failed: ${errorMessage(err)}`),
      );
  };

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        onQuit();
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
      if (input === "q") onQuit();
      else if (input === "?") setHelp(true);
      else if (input === "/") {
        setSearching(true);
        setQuery("");
        setIndex(0);
        setSelectedId(null);
      } else if (key.escape) {
        if (detail) setDetail(false);
        else {
          setQuery("");
          setMessage("");
        }
      } else if (input === "r") onRefresh();
      else if (input === "s") setMenu("sort");
      else if (input === "S")
        setSorts((current) => ({
          ...current,
          [tab]: { ...sort, dir: sort.dir === "asc" ? "desc" : "asc" },
        }));
      else if (input === "o") act(onOpen, "Opened");
      else if (input === "y") {
        if (copies.length) setMenu("copy");
        else setMessage("Nothing to copy for selected item");
      } else if (key.upArrow || input === "k") move(-1);
      else if (key.downArrow || input === "j") move(1);
      else if (key.pageDown) move(visible);
      else if (key.pageUp) move(-visible);
      else if (key.return && !detail && item) setDetail(true);
      else if ((key.return || input === "d") && detail && item?.pr)
        setReview(item);
      else if (input === "[" || key.leftArrow) chooseInstance(-1);
      else if (input === "]" || key.rightArrow) chooseInstance(1);
      else if (key.tab) chooseInstance(key.shift ? -1 : 1);
      else if (["1", "2", "3"].includes(input))
        changed(tabs[Number(input) - 1]!);
    },
    { isActive: review === null },
  );

  if (rows < 16 || width < 40)
    return (
      <Box flexDirection="column">
        <Text color="cyan">GitHub Dashboard</Text>
        <Text>Terminal needs at least 40×16. Press q to quit.</Text>
      </Box>
    );
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
  const status = stopping
    ? "Stopping — draining sync…"
    : syncing
      ? "Refreshing… cached data remains visible"
      : error
        ? `Sync error: ${error}`
        : failures.length
          ? failures.join(" | ")
          : cycle
            ? `Updated ${cycle.finishedAt}`
            : "Cached data · refresh pending";

  return (
    <Box width={width} height={rows} flexDirection="column">
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold color="cyan">
          ◆ GITHUB DASHBOARD
        </Text>
        <Text color={syncing ? "yellow" : "green"}>
          {syncing ? "● SYNCING" : "● READY"}
        </Text>
      </Box>
      <Box paddingX={1} gap={1}>
        {firstTab > 0 && <Text color="gray">‹</Text>}
        {visibleTabs.map((instance) => (
          <Text
            key={instance.id ?? "all"}
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
      </Box>
      <Box paddingX={1} gap={2}>
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
      <Box flexGrow={1} flexDirection="row">
        {review?.pr ? (
          <ReviewPane
            runtime={runtime}
            instanceId={review.instanceId}
            pr={review.pr}
            onBack={() => setReview(null)}
            onQuit={onQuit}
          />
        ) : help ? (
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
            <Text>Tab / Shift-Tab Switch instance tabs (including All)</Text>
            <Text>
              1 / 2 / 3 Switch My work, Requested reviews, Notifications
            </Text>
            <Text>[ / ] Cycle through instance tabs, too</Text>
            <Text>j / k or ↑ / ↓ Select item; PgUp / PgDn scroll</Text>
            <Text>
              / Search title, repository or instance; Enter applies, Esc clears
            </Text>
            <Text>o Open selected item in browser</Text>
            <Text>
              y then key Copy number, URL, branch, review request or files
            </Text>
            <Text>
              s then key Sort by field (again flips); S flips direction
            </Text>
            <Text>r Refresh (queued after any active fetch)</Text>
            <Text>q Quit (drains active fetch)</Text>
            <Text>Enter Show PR details; Enter / d again reviews the diff</Text>
            <Text>Esc Back to list / clear filter</Text>
            <Text> </Text>
            <Text color="gray">Press any key to close help</Text>
          </Box>
        ) : detail && item ? (
          <Box
            flexGrow={1}
            overflow="hidden"
            borderStyle="round"
            borderColor="cyan"
            flexDirection="column"
            paddingX={1}
          >
            <Text bold wrap="truncate-end">
              {item.pr && <Text color={colors.muted}>#{item.pr.number} </Text>}
              {safe(item.title)}
            </Text>
            <Text color={colors.muted} wrap="truncate-end">
              {safe(item.repo)} · {safe(item.label)}
            </Text>
            <Text> </Text>
            {item.pr ? (
              <PrDetails
                pr={item.pr}
                width={width - 4}
                // Chrome (5) + borders (2) + fixed detail lines (13).
                maxLines={rows - 20}
              />
            ) : (
              <>
                <Text>
                  <Text color={colors.muted}>Reason </Text>
                  {safe(item.notification?.reason ?? "unknown")}
                </Text>
                <Text>
                  <Text color={colors.muted}>Type </Text>
                  {safe(item.notification?.type ?? "unknown")}
                </Text>
                <Text>
                  <Text color={colors.muted}>Unread </Text>
                  {item.notification?.unread ? "yes" : "no"}
                </Text>
                <Text>
                  <Text color={colors.muted}>Updated </Text>
                  {ago(item.notification?.updatedAt) || "unknown"}
                </Text>
              </>
            )}
            <Text> </Text>
            <Text color="blue" wrap="truncate-end">
              {safe(item.url)}
            </Text>
          </Box>
        ) : (
          <Box
            flexGrow={1}
            borderStyle="round"
            borderColor="cyan"
            flexDirection="column"
            paddingX={1}
          >
            <Box justifyContent="space-between">
              <Text bold color="cyan">
                {tabLabels[tab].toUpperCase()} {filtered.length}
                {query ? ` / ${available.length}` : ""}
              </Text>
              <Text color={colors.muted}>
                {sort.field} {sort.dir === "asc" ? "↑" : "↓"}
              </Text>
            </Box>
            {filtered.length ? (
              listed.slice(start, start + visible).map((row, offset) => {
                const { entry } = row;
                const active = start + offset === selected;
                const showInstance = instances.length > 1 && !instanceId;
                return entry.pr ? (
                  <PrRow
                    key={entry.id}
                    entry={entry}
                    pr={entry.pr}
                    active={active}
                    // Every row in "My work" is yours; skip the redundant author.
                    showAuthor={tab !== "prs"}
                    stack={row}
                    width={width - 4}
                  />
                ) : entry.notification ? (
                  <NotificationRow
                    key={entry.id}
                    entry={entry}
                    notification={entry.notification}
                    active={active}
                    showInstance={showInstance}
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
      <Box paddingX={1}>
        <Text
          color={error || failures.length ? "yellow" : "gray"}
          wrap="truncate-end"
        >
          {shorten(message || status, width - 3)}
        </Text>
      </Box>
      <Box paddingX={1}>
        {menu ? (
          <LeaderMenu
            title={menu === "sort" ? "SORT" : "COPY"}
            options={
              menu === "sort"
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
            {review
              ? "REVIEW  j/k lines · [ ] files · V select lines · c comment · Esc back"
              : searching
                ? `SEARCH /${query}█  Enter apply · Esc cancel`
                : help
                  ? "HELP  Tab/Shift-Tab instances · 1-3 views · j/k move · / search · o open · y copy · r refresh · q quit · any key closes"
                  : detail
                    ? item?.pr
                      ? "DETAILS  Enter/d review diff · j/k next · o open · y copy · Esc back"
                      : "DETAILS  j/k next · o open · y copy · Esc back"
                    : "Tab instances  1-3 views  j/k move  Enter details  s sort  / search  ? help  q quit"}
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
        initialKind={options.kind}
        initialInstanceId={options.instanceId}
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
        initialKind={options.kind}
        initialInstanceId={options.instanceId}
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
    while (!abort.signal.aborted) {
      refresh = false;
      syncing = true;
      update();
      try {
        cycle = await runtime.sync({ instanceId: options.instanceId });
        error = null;
      } catch (err) {
        error = errorMessage(err);
      }
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
    await runtime.close();
  }
}
