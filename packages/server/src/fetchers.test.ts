import { describe, expect, it, vi } from "vitest";
import { getCiStatus, summarizeReviews } from "./fetchers.js";

describe("summarizeReviews", () => {
  it("returns empty arrays when no reviews", () => {
    expect(summarizeReviews([])).toEqual({
      approved: [],
      changesRequested: [],
    });
  });

  it("collects approvers and change-requesters", () => {
    const result = summarizeReviews([
      { state: "APPROVED", user: { login: "alice" } },
      { state: "CHANGES_REQUESTED", user: { login: "bob" } },
    ]);
    expect(result.approved).toEqual(["alice"]);
    expect(result.changesRequested).toEqual(["bob"]);
  });

  it("keeps only each reviewer's latest non-comment state", () => {
    const result = summarizeReviews([
      { state: "CHANGES_REQUESTED", user: { login: "alice" } },
      { state: "APPROVED", user: { login: "alice" } },
    ]);
    expect(result.approved).toEqual(["alice"]);
    expect(result.changesRequested).toEqual([]);
  });

  it("ignores COMMENTED reviews so they don't overwrite approval", () => {
    const result = summarizeReviews([
      { state: "APPROVED", user: { login: "alice" } },
      { state: "COMMENTED", user: { login: "alice" } },
    ]);
    expect(result.approved).toEqual(["alice"]);
  });

  it("skips reviews with no user", () => {
    const result = summarizeReviews([{ state: "APPROVED", user: null }]);
    expect(result.approved).toEqual([]);
  });

  it("dismissed review removes approval", () => {
    const result = summarizeReviews([
      { state: "APPROVED", user: { login: "alice" } },
      { state: "DISMISSED", user: { login: "alice" } },
    ]);
    expect(result.approved).toEqual([]);
    expect(result.changesRequested).toEqual([]);
  });
});

function mockClient(overrides: {
  statuses?: { state: string }[];
  checks?: { status: string; conclusion: string | null }[];
  statusesError?: boolean;
  checksError?: boolean;
}) {
  return {
    repos: {
      getCombinedStatusForRef: vi.fn(() =>
        overrides.statusesError
          ? Promise.reject(new Error("boom"))
          : Promise.resolve({ data: { statuses: overrides.statuses ?? [] } }),
      ),
    },
    checks: {
      listForRef: vi.fn(() =>
        overrides.checksError
          ? Promise.reject(new Error("boom"))
          : Promise.resolve({ data: { check_runs: overrides.checks ?? [] } }),
      ),
    },
    // biome-ignore lint: test mock — we intentionally type it as any
  } as any;
}

describe("getCiStatus", () => {
  it("returns 'unknown' when neither statuses nor checks exist", async () => {
    const result = await getCiStatus(mockClient({}), "o", "r", "ref");
    expect(result).toBe("unknown");
  });

  it("returns 'pending' when any check run is not completed", async () => {
    const result = await getCiStatus(
      mockClient({
        checks: [
          { status: "in_progress", conclusion: null },
          { status: "completed", conclusion: "success" },
        ],
      }),
      "o",
      "r",
      "ref",
    );
    expect(result).toBe("pending");
  });

  it("returns 'failure' on failed legacy status", async () => {
    const result = await getCiStatus(
      mockClient({ statuses: [{ state: "failure" }] }),
      "o",
      "r",
      "ref",
    );
    expect(result).toBe("failure");
  });

  it("returns 'failure' on errored legacy status", async () => {
    const result = await getCiStatus(
      mockClient({ statuses: [{ state: "error" }] }),
      "o",
      "r",
      "ref",
    );
    expect(result).toBe("failure");
  });

  it.each(["failure", "timed_out", "cancelled"])(
    "returns 'failure' when a completed check has conclusion %s",
    async (conclusion) => {
      const result = await getCiStatus(
        mockClient({ checks: [{ status: "completed", conclusion }] }),
        "o",
        "r",
        "ref",
      );
      expect(result).toBe("failure");
    },
  );

  it("returns 'success' when everything completed successfully", async () => {
    const result = await getCiStatus(
      mockClient({
        statuses: [{ state: "success" }],
        checks: [{ status: "completed", conclusion: "success" }],
      }),
      "o",
      "r",
      "ref",
    );
    expect(result).toBe("success");
  });

  it("tolerates both API calls failing (returns 'unknown')", async () => {
    const result = await getCiStatus(
      mockClient({ statusesError: true, checksError: true }),
      "o",
      "r",
      "ref",
    );
    expect(result).toBe("unknown");
  });
});
