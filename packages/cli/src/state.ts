import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SyncKind } from "sync";
import { defaultSort, sortFields, type SortState } from "./sort.js";

// UI preferences remembered across `ghd` runs. Disposable: anything missing or
// invalid falls back to defaults.
export type TuiState = {
  sorts: Record<SyncKind, SortState>;
  kind?: SyncKind;
  instanceId?: string;
};

const kinds: SyncKind[] = ["prs", "reviews", "notifications"];

export function statePath(env = process.env): string {
  const base = env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  return join(base, "github-dashboard", "tui.json");
}

function validSort(kind: SyncKind, value: unknown): SortState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { field, dir } = value as Record<string, unknown>;
  const fields: readonly string[] = sortFields[kind];
  return typeof field === "string" &&
    fields.includes(field) &&
    (dir === "asc" || dir === "desc")
    ? ({ field, dir } as SortState)
    : undefined;
}

export function parseState(raw: unknown): TuiState {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const sorts = (data.sorts ?? {}) as Record<string, unknown>;
  return {
    sorts: Object.fromEntries(
      kinds.map((kind) => [
        kind,
        validSort(kind, sorts[kind]) ?? defaultSort[kind],
      ]),
    ) as Record<SyncKind, SortState>,
    kind: kinds.includes(data.kind as SyncKind)
      ? (data.kind as SyncKind)
      : undefined,
    instanceId:
      typeof data.instanceId === "string" ? data.instanceId : undefined,
  };
}

export function loadState(path = statePath()): TuiState {
  try {
    return parseState(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return parseState(null);
  }
}

// Write-then-rename so a crash mid-write never leaves a torn file.
export function saveState(state: TuiState, path = statePath()): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);
    renameSync(temp, path);
  } catch {
    /* preferences are best-effort */
  }
}
