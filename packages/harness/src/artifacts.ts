import type { Page, TestInfo } from "@playwright/test";

/** Review evidence, not pixel-diff baselines: viewport/theme are pinned in config. */
export async function captureState(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  await page.evaluate(() => document.fonts.ready);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({
    path,
    fullPage: true,
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
