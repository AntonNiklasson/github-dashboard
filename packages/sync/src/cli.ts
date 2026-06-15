#!/usr/bin/env node
import { parseArgs } from "node:util";
import { openCache, wipeCacheFile } from "./cache/open.js";
import { CACHE_SCHEMA_VERSION } from "./cache/schema.js";
import { type Repository, createSqliteRepository } from "./cache/store.js";
import { type SyncKind, createSyncEngine, printSummary } from "./engine.js";

const USAGE = `ghd-sync — github-dashboard sync engine

Usage:
  ghd-sync <command> [options]

Commands:
  once [--instance <id>] [--kind <prs|reviews|notifications>]
                          Run a single sync cycle
  loop [--interval <seconds>]
                          Run cycles in a loop, sleeping <interval> seconds
                          after each one finishes (default: 25). Ctrl-C to stop.
  status                  Print cache path, schema version, row counts, last sync per instance
  wipe                    Delete the cache file and its sidecars

Options:
  -h, --help              Show this help
`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (
    !command ||
    command === "-h" ||
    command === "--help" ||
    command === "help"
  ) {
    process.stdout.write(USAGE);
    return 0;
  }

  switch (command) {
    case "once":
      return onceCommand(rest);
    case "loop":
      return loopCommand(rest);
    case "status":
      return statusCommand();
    case "wipe":
      return wipeCommand();
    default:
      process.stderr.write(`unknown command: ${command}\n\n${USAGE}`);
      return 1;
  }
}

async function onceCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      instance: { type: "string" },
      kind: { type: "string" },
    },
    allowPositionals: false,
  });

  const kind = values.kind as SyncKind | undefined;
  if (kind && !["prs", "reviews", "notifications"].includes(kind)) {
    process.stderr.write(
      `invalid --kind: ${kind} (expected prs|reviews|notifications)\n`,
    );
    return 1;
  }

  const { engine, close } = openEngine();
  try {
    const summary = await engine.runOnce({
      instance: values.instance,
      kind,
    });
    printSummary(summary);
    return 0;
  } finally {
    close();
  }
}

async function loopCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      interval: { type: "string" },
    },
    allowPositionals: false,
  });

  let intervalMs = 25_000;
  if (values.interval) {
    const seconds = Number(values.interval);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      process.stderr.write(
        `invalid --interval: ${values.interval} (expected positive number of seconds)\n`,
      );
      return 1;
    }
    intervalMs = Math.round(seconds * 1000);
  }

  const countdown = createCountdown(intervalMs);

  const { engine, close } = openEngine();
  engine.start({
    intervalMs,
    onCycle: (summary) => {
      countdown.stop();
      printSummary(summary);
      countdown.start();
    },
    onError: (err) => {
      countdown.stop();
      process.stderr.write(
        `cycle error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      countdown.start();
    },
  });
  try {
    await waitForSigint();
    countdown.stop();
    await engine.stop();
    return 0;
  } finally {
    close();
  }
}

// Live countdown rendered on a single line using \r. Skipped when stdout
// isn't a TTY (logs, pipes) so we don't litter files with CR-escape spam.
// After the countdown elapses, switches to "syncing..." until the next
// onCycle clears and restarts it.
function createCountdown(intervalMs: number): {
  start: () => void;
  stop: () => void;
} {
  if (!process.stdout.isTTY) {
    return { start: () => {}, stop: () => {} };
  }
  let timer: NodeJS.Timeout | null = null;
  let remainingSec = 0;
  const render = (text: string) => {
    process.stdout.write(`\r\x1b[K${text}`);
  };
  const clearLine = () => {
    process.stdout.write("\r\x1b[K");
  };
  return {
    start: () => {
      remainingSec = Math.ceil(intervalMs / 1000);
      render(`next sync in ${remainingSec}s`);
      timer = setInterval(() => {
        remainingSec -= 1;
        if (remainingSec <= 0) {
          if (timer) clearInterval(timer);
          timer = null;
          render("syncing...");
          return;
        }
        render(`next sync in ${remainingSec}s`);
      }, 1000);
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      clearLine();
    },
  };
}

function openEngine() {
  const { db, path, wiped } = openCache();
  if (wiped) {
    process.stderr.write(
      `cache wiped (schema version mismatch) — recreated at ${path}\n`,
    );
  }
  const repo = createSqliteRepository(db);
  const engine = createSyncEngine({ repo });
  return { db, engine, close: () => db.close() };
}

function statusCommand(): number {
  const { db, path } = openCache();
  try {
    printStatus(createSqliteRepository(db), path);
    return 0;
  } finally {
    db.close();
  }
}

function printStatus(repo: Repository, path: string): void {
  const version = repo.getSchemaVersion();
  process.stdout.write(`cache: ${path}\n`);
  process.stdout.write(
    `schema version: ${version} (code: ${CACHE_SCHEMA_VERSION})\n`,
  );

  const instances = repo.listInstances();
  if (instances.length === 0) {
    process.stdout.write(
      "\nno instances in cache yet — run 'ghd-sync once' to populate\n",
    );
    return;
  }

  for (const inst of instances) {
    process.stdout.write(
      `\ninstance: ${inst.id}  (${inst.label}, ${inst.username})\n`,
    );

    const prCounts = repo.countPrsByKind(inst.id);
    for (const c of prCounts) {
      process.stdout.write(`  prs (${c.kind}): ${c.count}\n`);
    }
    if (prCounts.length === 0) process.stdout.write("  prs: 0\n");

    process.stdout.write(
      `  notifications: ${repo.countNotifications(inst.id)}\n`,
    );

    for (const s of repo.listSyncStates(inst.id)) {
      const rate = s.rate_remaining != null ? `, rate ${s.rate_remaining}` : "";
      const reset = s.rate_reset_at ? ` (resets ${s.rate_reset_at})` : "";
      process.stdout.write(
        `  last ${s.kind.padEnd(18)} ${s.last_run_at ?? "never"}${rate}${reset}\n`,
      );
    }
  }
}

function wipeCommand(): number {
  const { existed, path } = wipeCacheFile();
  if (existed) {
    process.stdout.write(`wiped ${path}\n`);
  } else {
    process.stdout.write(`nothing to wipe (no cache at ${path})\n`);
  }
  return 0;
}

function waitForSigint(): Promise<void> {
  return new Promise((resolve) => {
    process.once("SIGINT", () => {
      process.stderr.write("\nstopping (SIGINT)...\n");
      resolve();
    });
  });
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(
      `fatal: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    if (err instanceof Error && err.stack) {
      process.stderr.write(`${err.stack}\n`);
    }
    process.exit(1);
  },
);
