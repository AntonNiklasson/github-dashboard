import { test, expect } from "@playwright/test";
import { startScenario } from "./runtime.js";
import { SCENARIO_TITLE } from "./github.js";

test("renders conflict, review-request membership, approval and empty states", async ({
  page,
}) => {
  const scenario = await startScenario();
  try {
    for (const phase of [
      "conflicts",
      "needs-approval",
      "changes-requested",
      "review-requested",
      "unassigned",
      "empty",
    ] as const) {
      scenario.setPhase(phase);
      await fetch(`${scenario.url}/api/${scenario.instanceId}/reviews?fresh=1`);
      await scenario.syncPrs();
      await page.goto(scenario.url);
      if (phase === "empty") {
        await expect(
          page.getByText("No open PRs", { exact: true }),
        ).toBeVisible();
      } else {
        const card = page
          .getByRole("listitem")
          .filter({ hasText: SCENARIO_TITLE });
        await expect(card).toHaveCount(1);
        if (phase === "conflicts")
          await expect(
            card.getByText("conflict", { exact: true }),
          ).toBeVisible();
        if (phase === "changes-requested")
          await expect(
            card.getByText("Changes requested", { exact: true }),
          ).toBeVisible();
      }
      await expect(
        page
          .getByRole("listitem")
          .filter({ hasText: "Review the storage change" }),
      ).toHaveCount(phase === "review-requested" ? 1 : 0);
    }
  } finally {
    await scenario.close();
  }
});

test("keeps two instances separate when one fails", async ({ page }) => {
  const scenario = await startScenario({ instances: 2 });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  try {
    await scenario.syncPrs();
    await scenario.syncPrs(1);
    await page.goto(scenario.url);
    const cards = page
      .getByRole("listitem")
      .filter({ hasText: SCENARIO_TITLE });
    await expect(cards).toHaveCount(2);
    scenario.setPhase("offline");
    await expect(scenario.syncPrs()).rejects.toThrow();
    scenario.setPhase("conflicts", 1);
    await scenario.syncPrs(1);
    await expect(page.getByText("conflict", { exact: true })).toBeVisible();
    await expect(cards).toHaveCount(2);
    await expect(
      page.getByLabel("Sync status: Sync failed — data may be stale", {
        exact: true,
      }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await scenario.close();
  }
});

test("shows a rate-limit pause and clears it after the budget resets", async ({
  page,
}) => {
  const scenario = await startScenario();
  try {
    await scenario.syncPrs();
    scenario.setPhase("rate-limited");
    await scenario.syncPrs();
    await scenario.syncPrs();
    await page.goto(scenario.url);
    const paused = page.getByLabel(
      "Sync status: Sync paused — data may be stale",
      { exact: true },
    );
    await expect(paused).toBeVisible();
    await paused.click();
    await expect(page.getByText(/Retry after/).first()).toBeVisible();
    scenario.setPhase("in-flight");
    await expect
      .poll(
        async () => {
          await scenario.syncPrs();
          const health = await (
            await fetch(`${scenario.url}/api/sync/health`)
          ).json();
          return health.find((entry: { kind: string }) => entry.kind === "prs")
            .status;
        },
        { timeout: 25_000, intervals: [1000] },
      )
      .toBe("updated");
    await page.reload();
    await expect(
      page.getByLabel("Sync status: Up to date", { exact: true }),
    ).toBeVisible();
  } finally {
    await scenario.close();
  }
});
