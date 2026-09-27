import { setTimeout as sleep } from "node:timers/promises";
import clipboard from "clipboardy";
import { Box, Text, render, useInput, useWindowSize } from "ink";
import open from "open";
import { useState } from "react";
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
  onCopy = (url: string) => clipboard.write(url),
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
  onCopy?: (url: string) => Promise<unknown>;
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
  const [detailOnly, setDetailOnly] = useState(false);
  const [message, setMessage] = useState("");
  const instances = runtime.listInstances();
  const available = itemsFor(runtime, tab, instanceId);
  const filtered = available.filter((item) =>
    `${item.repo} ${item.title} ${item.label}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const position = selectedId
    ? filtered.findIndex((item) => item.id === selectedId)
    : -1;
  const selected = Math.min(
    position >= 0 ? position : index,
    Math.max(0, filtered.length - 1),
  );
  const item = filtered[selected];
  const count = (kind: SyncKind) => itemsFor(runtime, kind, instanceId).length;
  const narrow = width < 85;
  const listWidth = narrow ? width - 2 : Math.floor(width * 0.48);
  // Each list entry occupies two terminal lines. Keep the footer visible.
  const visible = Math.max(1, Math.floor((rows - 10) / 2));
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
    setDetailOnly(false);
  };
  const chooseInstance = (direction: number) => {
    const ids = instanceOptions.map((i) => i.id);
    setInstanceId(
      ids[(ids.indexOf(instanceId) + direction + ids.length) % ids.length]!,
    );
    setIndex(0);
    setSelectedId(null);
  };
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(filtered.length - 1, selected + delta));
    setIndex(next);
    setSelectedId(filtered[next]?.id ?? null);
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

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onQuit();
      return;
    }
    if (help) {
      setHelp(false);
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
      if (detailOnly) setDetailOnly(false);
      else {
        setQuery("");
        setMessage("");
      }
    } else if (input === "r") onRefresh();
    else if (input === "o") act(onOpen, "Opened");
    else if (input === "y") act(onCopy, "Copied URL");
    else if (key.upArrow || input === "k") move(-1);
    else if (key.downArrow || input === "j") move(1);
    else if (key.pageDown) move(visible);
    else if (key.pageUp) move(-visible);
    else if (key.return && narrow) setDetailOnly(true);
    else if (input === "[" || key.leftArrow) chooseInstance(-1);
    else if (input === "]" || key.rightArrow) chooseInstance(1);
    else if (key.tab) chooseInstance(key.shift ? -1 : 1);
    else if (["1", "2", "3"].includes(input)) changed(tabs[Number(input) - 1]!);
  });

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
        {tabs.map((kind, i) => (
          <Text
            key={kind}
            bold={tab === kind}
            color={tab === kind ? "cyan" : "gray"}
          >
            {i + 1} {kind} {count(kind)}
          </Text>
        ))}
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
            <Text>Tab / Shift-Tab Switch instance tabs (including All)</Text>
            <Text>1 / 2 / 3 Switch PRs, reviews, notifications</Text>
            <Text>[ / ] Cycle through instance tabs, too</Text>
            <Text>j / k or ↑ / ↓ Select item; PgUp / PgDn scroll</Text>
            <Text>
              / Search title, repository or instance; Enter applies, Esc clears
            </Text>
            <Text>o Open selected item in browser</Text>
            <Text>y Copy selected item URL to clipboard</Text>
            <Text>r Refresh (queued after any active fetch)</Text>
            <Text>q Quit (drains active fetch)</Text>
            <Text>Esc Clear filter / return to list on narrow screens</Text>
            <Text> </Text>
            <Text color="gray">Press any key to close help</Text>
          </Box>
        ) : (
          <>
            {(!narrow || !detailOnly) && (
              <Box
                width={listWidth}
                borderStyle="round"
                borderColor="cyan"
                flexDirection="column"
                paddingX={1}
              >
                <Text bold color="cyan">
                  {tab.toUpperCase()} {filtered.length}
                  {query ? ` / ${available.length}` : ""}
                </Text>
                {filtered.length ? (
                  filtered
                    .slice(start, start + visible)
                    .map((entry, offset) => {
                      const active = start + offset === selected;
                      return (
                        <Box key={entry.id} flexDirection="column">
                          <Text
                            bold={active}
                            color={active ? "black" : "white"}
                            backgroundColor={active ? "cyan" : undefined}
                            wrap="truncate-end"
                          >
                            {active ? "❯" : " "}{" "}
                            {shorten(entry.title, listWidth - 7)}
                          </Text>
                          <Text color="gray" wrap="truncate-end">
                            {" "}
                            {shorten(
                              `${entry.label} · ${entry.repo}`,
                              listWidth - 8,
                            )}
                          </Text>
                        </Box>
                      );
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
            {(!narrow || detailOnly) && (
              <Box
                flexGrow={1}
                borderStyle="round"
                borderColor="gray"
                flexDirection="column"
                paddingX={1}
              >
                <Text bold color="cyan">
                  DETAILS
                </Text>
                {item ? (
                  <>
                    <Text bold wrap="truncate-end">
                      {safe(item.title)}
                    </Text>
                    <Text color="gray" wrap="truncate-end">
                      {safe(item.repo)} · {safe(item.label)}
                    </Text>
                    <Text> </Text>
                    {item.pr ? (
                      <>
                        <Text>
                          Author {safe(item.pr.author)}
                          {item.pr.draft ? " · DRAFT" : ""}
                        </Text>
                        <Text>
                          CI {safe(item.pr.ciStatus)} ·{" "}
                          {item.pr.unresolvedThreadCount} unresolved
                        </Text>
                        <Text>
                          Branch {safe(item.pr.headBranch)} →{" "}
                          {safe(item.pr.baseBranch)}
                        </Text>
                        <Text>
                          Changes +{item.pr.additions} / -{item.pr.deletions} ·{" "}
                          {item.pr.commits} commits
                        </Text>
                        <Text>
                          Reviews {safe(item.pr.reviewDecision ?? "pending")}
                        </Text>
                        <Text color="gray">
                          {shorten(
                            item.pr.body,
                            Math.max(1, width - listWidth - 11),
                          )}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text>
                          Reason {safe(item.notification?.reason ?? "unknown")}
                        </Text>
                        <Text>
                          Unread {item.notification?.unread ? "yes" : "no"}
                        </Text>
                      </>
                    )}
                    <Text> </Text>
                    <Text color="blue" wrap="truncate-end">
                      {safe(item.url)}
                    </Text>
                  </>
                ) : (
                  <Text color="gray">Select an item from the list</Text>
                )}
              </Box>
            )}
          </>
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
        <Text color="gray" wrap="truncate-end">
          {searching
            ? `SEARCH /${query}█  Enter apply · Esc cancel`
            : help
              ? "HELP  Tab/Shift-Tab instances · 1-3 views · j/k move · / search · o open · y copy · r refresh · q quit · any key closes"
              : "Tab instances  1-3 views  j/k move  / search  o open  y copy  r refresh  ? help  q quit"}
        </Text>
      </Box>
    </Box>
  );
}

export async function runTui(options: {
  instanceId?: string;
  kind?: SyncKind;
  intervalMs: number;
}): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("tui requires an interactive terminal");
  const runtime = createSync();
  const abort = new AbortController();
  let refresh = false;
  let wake: (() => void) | null = null;
  let cycle: SyncResult | null = null;
  let error: string | null = null;
  let syncing = false;
  let app: ReturnType<typeof render> | undefined;
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
    return 0;
  } finally {
    abort.abort();
    process.off("SIGINT", quit);
    process.off("SIGTERM", quit);
    app?.unmount();
    await runtime.close();
  }
}
