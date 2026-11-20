import { test, expect } from "@playwright/test";
import { startScenario } from "./runtime.js";

test("recomputes stale age when unchanged health is polled", async ({
  page,
}) => {
  const scenario = await startScenario();
  try {
    await scenario.syncPrs();
    await page.goto(scenario.url);
    await expect(page.getByLabel(/^Sync status: Synced /)).toBeVisible();
    // Advance client time without waiting 150 seconds. The persisted upstream
    // timestamp remains unchanged; structural sharing must not hide its age.
    await page.clock.install();
    await page.clock.fastForward(180_000);
    await expect(
      page.getByLabel("Sync status: Data is stale", { exact: true }),
    ).toBeVisible();
  } finally {
    await scenario.close();
  }
});
