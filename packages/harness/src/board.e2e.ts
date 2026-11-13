import { test, expect } from "@playwright/test";
import { startScenario } from "./runtime.js";
import { captureState } from "./artifacts.js";
import { SCENARIO_TITLE } from "./github.js";

test("polls queue entry, queue failure, and recovery through the real sync engine", async ({
  page,
}, testInfo) => {
  const scenario = await startScenario();
  const errors: string[] = [];
  const apiResponses: { url: string; status: number }[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/")) {
      apiResponses.push({ url: response.url(), status: response.status() });
    }
  });
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== scenario.url) {
      errors.push(`Unexpected external request: ${route.request().url()}`);
      return route.abort();
    }
    return route.continue();
  });
  try {
    await scenario.syncAll();
    await page.goto(scenario.url);
    const card = page.getByRole("listitem").filter({ hasText: SCENARIO_TITLE });
    await expect(card).toHaveCount(1);
    await expect(card.getByText("passing", { exact: true })).toBeVisible();
    await expect(
      card.getByRole("img", { name: "Ready for review", exact: true }),
    ).toBeVisible();

    await captureState(page, testInfo, "in-flight");
    scenario.setPhase("queued");
    await scenario.syncAll();
    expect(await scenario.persistedPrs()).toMatchObject([
      { number: 101, inMergeQueue: true, ciStatus: "pending" },
    ]);
    // No page reload or response mocking: the renderer's normal poll must
    // discover the engine's newly persisted snapshot.
    await expect(
      card.getByRole("img", { name: "In merge queue", exact: true }),
    ).toBeVisible();
    await expect(card.getByText("pending", { exact: true })).toBeVisible();
    await expect(card).toHaveCount(1);

    await captureState(page, testInfo, "queued");
    scenario.setPhase("queue-failed");
    await scenario.syncAll();
    expect(await scenario.persistedPrs()).toMatchObject([
      { number: 101, inMergeQueue: false, ciStatus: "failure" },
    ]);
    await expect(
      card.getByRole("img", { name: "In merge queue", exact: true }),
    ).toHaveCount(0);
    await expect(card.getByText("failing", { exact: true })).toBeVisible();
    await expect(card).toHaveCount(1);

    await captureState(page, testInfo, "queue-failed");
    scenario.setPhase("offline");
    await expect(scenario.syncAll()).rejects.toThrow("Scenario sync failed");
    expect(await scenario.persistedPrs()).toMatchObject([
      { number: 101, ciStatus: "failure" },
    ]);
    await expect(card.getByText("failing", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("Sync status: Sync failed — data may be stale", {
        exact: true,
      }),
    ).toBeVisible();

    await captureState(page, testInfo, "upstream-outage");
    scenario.setPhase("in-flight");
    await scenario.syncAll();
    await expect(card.getByText("passing", { exact: true })).toBeVisible();
    await expect(card).toHaveCount(1);
    expect(await scenario.persistedPrs()).toHaveLength(1);
    await expect(
      page.getByLabel("Sync status: Up to date", { exact: true }),
    ).toBeVisible();
    await captureState(page, testInfo, "recovered");
    expect(errors).toEqual([]);
    expect(apiResponses.length).toBeGreaterThan(3);
    expect(apiResponses.every((response) => response.status === 200)).toBe(
      true,
    );
  } finally {
    await testInfo.attach("scenario-diagnostics", {
      body: JSON.stringify(
        { ...scenario.diagnostics(), errors, apiResponses },
        null,
        2,
      ),
      contentType: "application/json",
    });
    await scenario.close();
  }
});
