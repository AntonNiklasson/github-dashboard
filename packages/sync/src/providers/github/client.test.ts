import { afterEach, expect, test, vi } from "vitest";
import { getClient } from "./client.js";

afterEach(() => vi.restoreAllMocks());

// The TUI owns the terminal; Octokit's request log (e.g. "GET … - 304 with
// id …") must not leak onto it through console.
test("Octokit clients don't log to the console", () => {
  const spies = (["debug", "info", "warn", "error", "log"] as const).map(
    (level) => vi.spyOn(console, level).mockImplementation(() => {}),
  );
  const client = getClient({
    id: "test",
    label: "test",
    baseUrl: "https://api.github.com",
    token: "t",
  } as Parameters<typeof getClient>[0]);
  client.log.info("GET /notifications - 200");
  client.log.error("GET /notifications - 304 with id X in 5ms");
  client.log.warn("deprecated");
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
});
