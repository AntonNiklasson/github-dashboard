import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { defaultSort } from "./sort.js";
import { loadState, saveState, statePath } from "./state.js";

const dirs: string[] = [];
const tempFile = () => {
  const dir = mkdtempSync(join(tmpdir(), "ghd-state-"));
  dirs.push(dir);
  return join(dir, "nested", "tui.json");
};
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

test("round-trips sorts, view and instance", () => {
  const path = tempFile();
  const state = {
    sorts: { ...defaultSort, prs: { field: "status", dir: "asc" } as const },
    kind: "reviews" as const,
    instanceId: "github-com",
  };
  saveState(state, path);
  expect(loadState(path)).toEqual(state);
});

test("missing or corrupt files fall back to defaults", () => {
  const path = tempFile();
  expect(loadState(path)).toEqual({ sorts: defaultSort });
  saveState({ sorts: defaultSort }, path);
  writeFileSync(path, "{not json");
  expect(loadState(path).sorts).toEqual(defaultSort);
});

test("invalid entries are dropped individually", () => {
  const path = tempFile();
  saveState({ sorts: defaultSort }, path);
  writeFileSync(
    path,
    JSON.stringify({
      sorts: {
        prs: { field: "author", dir: "asc" }, // author isn't a My work field
        reviews: { field: "author", dir: "asc" },
        notifications: { field: "updated", dir: "sideways" },
      },
      kind: "nope",
      instanceId: 5,
    }),
  );
  expect(loadState(path)).toEqual({
    sorts: {
      prs: defaultSort.prs,
      reviews: { field: "author", dir: "asc" },
      notifications: defaultSort.notifications,
    },
  });
  expect(JSON.parse(readFileSync(path, "utf8")).kind).toBe("nope");
});

test("lives under XDG_STATE_HOME", () => {
  expect(statePath({ XDG_STATE_HOME: "/x" })).toBe(
    "/x/github-dashboard/tui.json",
  );
});
