import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
function run(args, env = process.env) {
  const result = spawnSync("pnpm", args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`pnpm ${args.join(" ")} failed (${result.status})`);
}
try {
  run(["--filter", "desktop", "package:dir", "--publish", "never"], {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  });
  run([
    "--filter",
    "harness",
    "exec",
    "playwright",
    "test",
    "-c",
    "playwright.desktop.config.ts",
  ]);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  // pnpm shares the addon: packaging rebuilds it for Electron's ABI. Restore
  // the host Node ABI even after failure, so dev servers and tests still work.
  try {
    run(["--filter", "sync", "rebuild", "better-sqlite3"]);
    run([
      "--filter",
      "sync",
      "exec",
      "node",
      "-e",
      "const D=require('better-sqlite3'); const db=new D(':memory:'); db.close(); console.log('Host SQLite ABI restored');",
    ]);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
