#!/usr/bin/env node
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { createSync, type SyncKind, type SyncResult } from "sync";
import { runTui } from "./tui.js";

const usage =
  "Usage: ghd [tui|once|list|watch] [--instance ID] [--kind prs|reviews|notifications] [--json] [--interval SECONDS] [--demo]\nDefault: tui (interactive terminal required).\n";
const kinds: SyncKind[] = ["prs", "reviews", "notifications"];

async function main(args: string[]): Promise<number> {
  const [arg, ...rest] = args;
  const command = arg ?? "tui";
  if (command === "--help") {
    process.stdout.write(usage);
    return 0;
  }
  if (!["tui", "once", "list", "watch"].includes(command))
    throw new Error(`unknown command: ${command}`);
  const { values } = parseArgs({
    args: rest,
    options: {
      instance: { type: "string" },
      kind: { type: "string" },
      json: { type: "boolean" },
      interval: { type: "string" },
      demo: { type: "boolean" },
    },
  });
  if (values.kind && !kinds.includes(values.kind as SyncKind))
    throw new Error(`invalid kind: ${values.kind}`);
  if (
    values.interval &&
    (!["watch", "tui"].includes(command) ||
      !Number.isFinite(Number(values.interval)) ||
      Number(values.interval) <= 0)
  )
    throw new Error("invalid interval");
  if (values.demo && command !== "tui")
    throw new Error("--demo is only supported in tui mode");
  if (command === "tui") {
    if (values.json) throw new Error("--json is not supported in tui mode");
    return runTui({
      instanceId: values.instance,
      kind: values.kind as SyncKind | undefined,
      intervalMs: Number(values.interval ?? 25) * 1000,
      demo: values.demo,
    });
  }
  const runtime = createSync();
  const selected = values.kind as SyncKind | undefined;
  const request = {
    instanceId: values.instance,
    kinds: selected ? [selected] : undefined,
  };
  const snapshot = (cycle: SyncResult | null) => {
    const instances = runtime
      .listInstances()
      .filter((i) => !values.instance || i.id === values.instance);
    return {
      cycle,
      instances: instances.map((i) => ({
        ...i,
        prs:
          !selected || selected === "prs"
            ? runtime.listPullRequests(i.id, "prs")
            : undefined,
        reviews:
          !selected || selected === "reviews"
            ? runtime.listPullRequests(i.id, "reviews")
            : undefined,
        notifications:
          !selected || selected === "notifications"
            ? runtime.listNotifications(i.id)
            : undefined,
      })),
    };
  };
  const output = (cycle: SyncResult | null) => {
    const data = snapshot(cycle);
    if (values.json) process.stdout.write(`${JSON.stringify(data)}\n`);
    else {
      process.stdout.write(
        `${cycle ? `sync ${cycle.finishedAt}\n` : "cached (offline)\n"}`,
      );
      if (!data.instances.length) process.stdout.write("no cached instances\n");
      for (const i of data.instances) {
        process.stdout.write(`${i.label} (${i.id}, ${i.username})\n`);
        for (const [kind, items] of [
          ["prs", i.prs],
          ["reviews", i.reviews],
        ] as const) {
          if (!items) continue;
          process.stdout.write(`  ${kind} (${items.length})\n`);
          for (const pr of items)
            process.stdout.write(`    ${pr.repo}#${pr.number} ${pr.title}\n`);
        }
        if (i.notifications) {
          process.stdout.write(`  notifications (${i.notifications.length})\n`);
          for (const n of i.notifications)
            process.stdout.write(`    ${n.repo}: ${n.title}\n`);
        }
      }
      for (const r of cycle?.results ?? [])
        for (const f of r.fetches)
          process.stdout.write(
            `  ${r.instanceId} ${f.kind}: ${f.status}${f.reason ? ` (${f.reason})` : ""}\n`,
          );
    }
  };
  const abort = new AbortController();
  const stop = () => abort.abort();
  if (command === "watch") {
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }
  try {
    if (command === "list") {
      output(null);
      return 0;
    }
    if (command === "once") {
      const result = await runtime.sync(request);
      output(result);
      return result.results.some((r) =>
        r.fetches.some((f) => f.status === "failed"),
      )
        ? 2
        : 0;
    }
    output(null);
    while (!abort.signal.aborted) {
      try {
        output(await runtime.sync(request));
      } catch (err) {
        process.stderr.write(
          `cycle: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
      if (abort.signal.aborted) break;
      try {
        await sleep(Number(values.interval ?? 25) * 1000, undefined, {
          signal: abort.signal,
        });
      } catch {
        break;
      }
    }
    return 0;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await runtime.close();
  }
}
main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    // Stack traces help debug TUI render crashes; set GHD_DEBUG=1.
    process.stderr.write(
      `${err instanceof Error ? (process.env.GHD_DEBUG ? err.stack : err.message) : String(err)}\n`,
    );
    process.exitCode = 1;
  },
);
