import {
  _electron,
  test,
  expect,
  type ElectronApplication,
} from "@playwright/test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startGitHub, SCENARIO_TITLE, SCENARIO_TOKEN } from "./github.js";
import { captureState } from "./artifacts.js";

const repo = resolve(import.meta.dirname, "../../..");
const executablePath =
  process.env.GHD_PACKAGED_APP ??
  join(
    repo,
    "packages/desktop/release",
    process.arch === "arm64" ? "mac-arm64" : "mac",
    "GitHub Dashboard.app/Contents/MacOS/GitHub Dashboard",
  );

test("packaged Electron loads SQLite, persists across restart, and closes its embedded server", async () => {
  const testInfo = test.info();
  test.skip(
    process.platform !== "darwin" && !process.env.GHD_PACKAGED_APP,
    "Default packaged path is macOS; pass GHD_PACKAGED_APP on other platforms",
  );
  const root = mkdtempSync(join(tmpdir(), "ghd-packaged-"));
  const github = await startGitHub();
  github.setPhase("queued");
  const config = join(root, "config/github-dashboard");
  const userData = join(root, "user-data");
  const cacheFile = join(root, "cache/github-dashboard/cache.sqlite");
  mkdirSync(config, { recursive: true });
  mkdirSync(userData);
  writeFileSync(
    join(config, "config.yml"),
    `instances:\n  - domain: ${github.domain}\n    label: Packaged scenario\n    token: ${SCENARIO_TOKEN}\n`,
    { mode: 0o600 },
  );
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, {
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_CACHE_HOME: join(root, "cache"),
    GHD_USER_DATA_DIR: userData,
    GHD_DISABLE_UPDATES: "1",
    DEMO: "0",
  });
  let application: ElectronApplication | undefined;
  const logs: string[] = [];
  const errors: string[] = [];
  const origins: string[] = [];
  try {
    for (const launch of ["first-launch", "restart"] as const) {
      application = await _electron.launch({ executablePath, env });
      application
        .process()
        .stdout?.on("data", (chunk) => logs.push(chunk.toString()));
      application
        .process()
        .stderr?.on("data", (chunk) => logs.push(chunk.toString()));
      const details = await application.evaluate(({ app }) => ({
        packaged: app.isPackaged,
        path: app.getAppPath(),
        userData: app.getPath("userData"),
      }));
      expect(details.packaged).toBe(true);
      expect(details.path).toMatch(/app\.asar$/);
      expect(details.userData).toBe(userData);
      if (launch === "restart") {
        // Read before depending on a new response: the previous process wrote
        // this snapshot, using the native addon shipped inside the package.
        expect(await persisted(application, cacheFile)).toMatchObject([
          { number: 101, inMergeQueue: true },
        ]);
      }
      const page = await application.firstWindow();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await expect(
        page.getByRole("listitem").filter({ hasText: SCENARIO_TITLE }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("img", { name: "In merge queue", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Sync status: Up to date", { exact: true }),
      ).toBeVisible();
      expect(await persisted(application, cacheFile)).toMatchObject([
        { number: 101, inMergeQueue: true },
      ]);
      await captureState(page, testInfo, launch);
      const origin = new URL(page.url()).origin;
      origins.push(origin);
      expect(new URL(origin).hostname).toBe("localhost");
      const process = application.process();
      await application.close();
      expect(process.exitCode).toBe(0);
      application = undefined;
      await expect
        .poll(async () => {
          try {
            await fetch(`${origin}/api/config`, {
              signal: AbortSignal.timeout(500),
            });
            return false;
          } catch {
            return true;
          }
        })
        .toBe(true);
    }
    expect(errors).toEqual([]);
  } finally {
    if (application) await application.close();
    await testInfo.attach("packaged-diagnostics", {
      body: JSON.stringify(
        { logs, errors, origins, requests: github.requests },
        null,
        2,
      ),
      contentType: "application/json",
    });
    await github.close();
    rmSync(root, { recursive: true, force: true });
  }
});

async function persisted(application: ElectronApplication, cacheFile: string) {
  return application.evaluate(async ({ app }, file) => {
    const { createRequire } = process.getBuiltinModule("module");
    const packageRequire = createRequire(`${app.getAppPath()}/package.json`);
    const Database = packageRequire("better-sqlite3");
    const db = new Database(file, { readonly: true });
    try {
      return (
        db.prepare("SELECT payload FROM prs WHERE kind='prs'").all() as {
          payload: string;
        }[]
      ).map((row) => JSON.parse(row.payload));
    } finally {
      db.close();
    }
  }, cacheFile);
}
