import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createSync } from "sync";
import { startGitHub, SCENARIO_TOKEN, type Phase } from "./github.js";

const repo = resolve(import.meta.dirname, "../../..");

/** Runs the real API + built renderer against an isolated upstream and cache. */
export async function startScenario() {
  const root = mkdtempSync(join(tmpdir(), "ghd-scenario-"));
  let github: Awaited<ReturnType<typeof startGitHub>> | undefined;
  let child: ChildProcess | undefined;
  let output = "";
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        const exited = new Promise<void>((resolve) =>
          child!.once("exit", () => resolve()),
        );
        child.kill("SIGTERM");
        const force = setTimeout(() => child?.kill("SIGKILL"), 3000);
        force.unref();
        await exited;
        clearTimeout(force);
      }
      await github?.close();
      rmSync(root, { recursive: true, force: true });
    })());
  try {
    github = await startGitHub();
    const instanceId = github.instance.id;
    const configHome = join(root, "config");
    const cacheHome = join(root, "cache");
    mkdirSync(join(configHome, "github-dashboard"), { recursive: true });
    writeFileSync(
      join(configHome, "github-dashboard/config.yml"),
      `instances:\n  - domain: ${github.domain}\n    label: Scenario GitHub\n    token: ${SCENARIO_TOKEN}\n`,
      { mode: 0o600 },
    );
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    child = spawn(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        "--conditions=development",
        join(repo, "packages/server/src/index.ts"),
      ],
      {
        cwd: repo,
        env: {
          ...process.env,
          PORT: String(port),
          DEMO: "0",
          XDG_CONFIG_HOME: configHome,
          XDG_CACHE_HOME: cacheHome,
          GHD_DATA_DIR: root,
          GHD_WEB_DIST: join(repo, "packages/web/dist"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });
    let spawnError: Error | undefined;
    child.on("error", (error) => {
      spawnError = error;
    });
    const deadline = Date.now() + 10_000;
    while (true) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null)
        throw new Error(`Scenario server exited:\n${output}`);
      try {
        const response = await fetch(`${url}/api/config`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok && (await response.json()).status.kind === "ready")
          break;
      } catch {
        /* Server is still starting. */
      }
      if (Date.now() > deadline)
        throw new Error(`Scenario server did not become ready:\n${output}`);
      await delay(50);
    }
    return {
      url,
      instanceId,
      setPhase(phase: Phase) {
        github!.setPhase(phase);
      },
      async syncPrs() {
        const response = await fetch(`${url}/api/${instanceId}/prs?fresh=1`);
        if (!response.ok)
          throw new Error(`Scenario sync failed (${response.status})`);
        return response.json();
      },
      async persistedPrs() {
        // Open the actual database through the public engine API. Only its
        // synchronous constructor needs the scoped environment override.
        const previous = process.env.XDG_CACHE_HOME;
        let reader: ReturnType<typeof createSync>;
        try {
          process.env.XDG_CACHE_HOME = cacheHome;
          reader = createSync();
        } finally {
          if (previous === undefined) delete process.env.XDG_CACHE_HOME;
          else process.env.XDG_CACHE_HOME = previous;
        }
        try {
          return reader.listPullRequests(instanceId, "prs");
        } finally {
          await reader.close();
        }
      },
      diagnostics: () => ({ server: output, requests: [...github!.requests] }),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === "string") throw new Error("Missing port");
  return address.port;
}
