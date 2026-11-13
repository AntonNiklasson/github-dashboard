import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createSync } from "sync";
import { startGitHub } from "./github.js";

afterEach(() => vi.unstubAllEnvs());

it("syncs queue transitions into SQLite, preserves the last snapshot on failure, and survives restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "ghd-simulator-"));
  vi.stubEnv("XDG_CACHE_HOME", root);
  const github = await startGitHub();
  const options = { loadInstances: () => [github.instance] };
  let engine = createSync(options);
  try {
    for (const [phase, inMergeQueue, ciStatus] of [
      ["in-flight", false, "success"],
      ["queued", true, "pending"],
      ["queue-failed", false, "failure"],
    ] as const) {
      github.setPhase(phase);
      const result = await engine.sync();
      expect(result.results[0].fetches.map((f) => f.status)).toEqual([
        "updated",
        "updated",
        "updated",
      ]);
      const prs = engine.listPullRequests(github.instance.id, "prs");
      expect(prs).toHaveLength(1);
      expect(prs[0]).toMatchObject({ number: 101, inMergeQueue, ciStatus });
    }
    const successful = engine
      .getHealth()
      .find((health) => health.kind === "prs")!;
    expect(successful).toMatchObject({ status: "updated", reason: null });
    expect(successful.lastSuccessAt).toBeTruthy();
    github.setPhase("offline");
    const failed = await engine.sync();
    expect(failed.results[0].fetches.every((f) => f.status === "failed")).toBe(
      true,
    );
    expect(engine.listPullRequests(github.instance.id, "prs")[0].ciStatus).toBe(
      "failure",
    );
    expect(
      engine.getHealth().find((health) => health.kind === "prs"),
    ).toMatchObject({
      status: "failed",
      lastSuccessAt: successful.lastSuccessAt,
    });
    await engine.close();
    engine = createSync(options);
    expect(
      engine.getHealth().find((health) => health.kind === "prs")?.status,
    ).toBe("failed");
    expect(engine.listPullRequests(github.instance.id, "prs")).toHaveLength(1);
    expect(engine.listPullRequests(github.instance.id, "prs")[0]).toMatchObject(
      { inMergeQueue: false, ciStatus: "failure" },
    );
    github.setPhase("in-flight");
    await engine.sync();
    expect(engine.listPullRequests(github.instance.id, "prs")[0].ciStatus).toBe(
      "success",
    );
    expect(github.requests.some((r) => r.path === "/api/graphql")).toBe(true);
  } finally {
    await engine.close();
    await github.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("rejects unexpected calls instead of pretending they succeeded", async () => {
  const github = await startGitHub();
  try {
    expect((await fetch(`${github.domain}/api/v3/user`)).status).toBe(401);
    expect(
      (
        await fetch(`${github.domain}/api/v3/unknown`, {
          headers: { authorization: `token ${github.instance.token}` },
        })
      ).status,
    ).toBe(501);
  } finally {
    await github.close();
  }
});
