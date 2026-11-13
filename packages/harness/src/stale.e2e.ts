import { test, expect } from "@playwright/test";
import { startScenario } from "./runtime.js";

test("recomputes stale age when unchanged health is polled", async ({
  page,
}) => {
  const scenario = await startScenario();
  try {
    await scenario.syncPrs();
    await page.goto(scenario.url);
    await expect(
      page.getByLabel("Sync status: Up to date", { exact: true }),
    ).toBeVisible();
    // Advance client time without waiting 90 seconds. The persisted upstream
    // timestamp remains unchanged; structural sharing must not hide its age.
    await page.clock.install();
    await page.clock.fastForward(120_000);
    await expect(
      page.getByLabel("Sync status: Data is stale", { exact: true }),
    ).toBeVisible();
  } finally {
    await scenario.close();
  }
});
