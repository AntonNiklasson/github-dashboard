import { emitKeypressEvents } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { createSync, type SyncKind, type SyncResult } from "sync";

type Runtime = ReturnType<typeof createSync>;
type Tab = SyncKind;
const tabs: Tab[] = ["prs", "reviews", "notifications"];

// Provider content is untrusted. Strip terminal controls before drawing it.
function clean(text: string): string {
  // eslint-disable-next-line no-control-regex -- provider strings must not control the terminal
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}
function fit(text: string, width: number): string {
  const safe = clean(text);
  return safe.length > width
    ? `${safe.slice(0, Math.max(0, width - 1))}…`
    : safe;
}

export function render(
  runtime: Runtime,
  view: {
    tab: Tab;
    index: number;
    instanceId?: string;
    cycle: SyncResult | null;
    error: string | null;
    syncing: boolean;
  },
  width: number,
  height: number,
): string {
  const instances = runtime
    .listInstances()
    .filter((i) => !view.instanceId || i.id === view.instanceId);
  const rows = instances.flatMap((instance) => {
    if (view.tab === "notifications")
      return runtime.listNotifications(instance.id).map((item) => ({
        title: `${instance.label} · ${item.repo} · ${item.title}`,
        detail: `${item.reason}${item.unread ? " · unread" : ""} · ${item.url}`,
      }));
    return runtime.listPullRequests(instance.id, view.tab).map((item) => ({
      title: `${instance.label} · ${item.repo}#${item.number} · ${item.title}`,
      detail: `${item.author} · ${item.ciStatus} · ${item.url}`,
    }));
  });
  const selected = Math.min(view.index, Math.max(0, rows.length - 1));
  const w = Math.max(1, width);
  const lines: string[] = [
    "GitHub Dashboard" + (view.syncing ? "   syncing…" : ""),
    instances.length
      ? instances
          .map((i) => `${i.label} (${i.username || "not synced"})`)
          .join("  |  ")
      : "No cached instances — press r to sync",
    tabs
      .map(
        (tab, i) =>
          `${view.tab === tab ? "[" : " "}${i + 1} ${tab}${view.tab === tab ? "]" : " "}`,
      )
      .join("   "),
    "─".repeat(Math.min(w, 120)),
  ];
  const available = Math.max(0, height - 9);
  const start = Math.max(0, selected - available + 1);
  for (let i = start; i < Math.min(rows.length, start + available); i++) {
    const row = rows[i]!;
    lines.push(`${i === selected ? "❯" : " "} ${row.title}`);
  }
  if (!rows.length) lines.push("No cached items in this view");
  const item = rows[selected];
  lines.push("─".repeat(Math.min(w, 120)));
  if (item) lines.push(item.detail);
  const outcomes =
    view.cycle?.results.flatMap((r) =>
      r.fetches.map(
        (f) =>
          `${r.instanceId}/${f.kind}: ${f.status}${f.reason ? ` (${f.reason})` : ""}`,
      ),
    ) ?? [];
  lines.push(
    view.error
      ? `Error: ${view.error}`
      : outcomes.join("  |  ") || "Cached data · not yet refreshed",
  );
  lines.push(`Last sync: ${view.cycle?.finishedAt ?? "never"}`);
  lines.push("1-3/Tab view  ↑↓/j/k select  r refresh  q quit");
  return `\x1b[H\x1b[2J${lines
    .slice(0, Math.max(1, height))
    .map((line) => fit(line, w))
    .join("\n")}`;
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
  let tab: Tab = options.kind ?? "prs";
  let index = 0;
  let cycle: SyncResult | null = null;
  let error: string | null = null;
  let syncing = false;
  let refresh = false;
  let wake: (() => void) | null = null;
  const draw = () =>
    process.stdout.write(
      render(
        runtime,
        { tab, index, instanceId: options.instanceId, cycle, error, syncing },
        process.stdout.columns || 80,
        process.stdout.rows || 24,
      ),
    );
  const stop = () => {
    abort.abort();
    wake?.();
  };
  const key = (
    _str: string,
    press: { name?: string; ctrl?: boolean; sequence?: string },
  ) => {
    if (press.name === "q" || (press.ctrl && press.name === "c")) stop();
    else if (press.name === "tab") {
      tab = tabs[(tabs.indexOf(tab) + 1) % tabs.length]!;
      index = 0;
    } else if (press.name === "1" || press.name === "2" || press.name === "3") {
      tab = tabs[Number(press.name) - 1]!;
      index = 0;
    } else if (press.name === "up" || press.name === "k")
      index = Math.max(0, index - 1);
    else if (press.name === "down" || press.name === "j") index++;
    else if (press.name === "r") {
      refresh = true;
      wake?.();
    }
    draw();
  };
  const resize = () => draw();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.stdout.on("resize", resize);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("keypress", key);
  process.stdout.write("\x1b[?1049h\x1b[?25l");
  try {
    draw();
    while (!abort.signal.aborted) {
      refresh = false;
      syncing = true;
      draw();
      try {
        cycle = await runtime.sync({ instanceId: options.instanceId });
        error = null;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      syncing = false;
      draw();
      if (abort.signal.aborted) break;
      if (refresh) continue;
      // Manual refresh interrupts the delay, but never overlaps an active sync.
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
    process.stdin.off("keypress", key);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.off("resize", resize);
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    process.stdout.write("\x1b[?25h\x1b[?1049l");
    await runtime.close();
  }
}
