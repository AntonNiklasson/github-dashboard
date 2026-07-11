import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as publicApi from "./index.js";
import { createSyncService, type SyncService } from "./index.js";

describe("public surface", () => {
  let cacheRoot: string;
  let previousXdg: string | undefined;
  let service: SyncService | undefined;

  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), "ghd-public-"));
    previousXdg = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = cacheRoot;
  });

  afterEach(async () => {
    await service?.close();
    if (previousXdg === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = previousXdg;
    rmSync(cacheRoot, { recursive: true, force: true });
  });

  test("exposes the service boundary without storage or engine constructors", async () => {
    expect(Object.keys(publicApi)).toEqual(["createSyncService"]);

    service = createSyncService();
    expect(service.listAuthoredPullRequests("github-com")).toEqual([]);
    expect(service.listReviewRequests("github-com")).toEqual([]);
    expect(service.listNotifications("github-com")).toEqual([]);
  });
});
