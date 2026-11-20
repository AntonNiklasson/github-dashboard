import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src",
  testMatch: "**/*.desktop.ts",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: "desktop-test-results",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "desktop-report" }],
  ],
});
