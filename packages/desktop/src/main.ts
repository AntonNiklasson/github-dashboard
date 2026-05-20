import { BrowserWindow, Menu, app, ipcMain, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { autoUpdater } from "electron-updater";
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

// In dev, the repo root is three levels up from packages/desktop/dist (where
// main.js lives after tsgo compiles it).
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const LOGS_DIR = path.join(REPO_ROOT, ".logs");

// In dev, `app.name` defaults to the package.json `name` ("@github-dashboard/
// desktop"), which surfaces as "Electron" in the macOS app menu. Force it
// here so the dev menu matches the packaged build (Info.plist sets it there).
app.setName("GitHub Dashboard");

let mainWindow: BrowserWindow | null = null;
let serverPort = 0;
let devServerProc: ChildProcess | null = null;
let devWebProc: ChildProcess | null = null;

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (typeof addr === "object" && addr) {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not resolve free port")));
      }
    });
  });
}

async function startEmbeddedServer(): Promise<void> {
  serverPort = await findFreePort();
  process.env.GHD_DATA_DIR = app.getPath("userData");
  process.env.PORT = String(serverPort);
  process.env.GHD_WEB_DIST = path.join(process.resourcesPath, "web");
  // Importing has the side effect of starting the Hono server. The bundle
  // lives at Resources/server.mjs (see extraResources in package.json).
  await import(path.join(process.resourcesPath, "server.mjs"));
  await waitForUrl(`http://localhost:${serverPort}/api/instances`);
}

function tee(proc: ChildProcess, file: string): void {
  const out = createWriteStream(path.join(LOGS_DIR, file), { flags: "w" });
  proc.stdout?.pipe(out, { end: false });
  proc.stderr?.pipe(out, { end: false });
  proc.stdout?.pipe(process.stdout, { end: false });
  proc.stderr?.pipe(process.stderr, { end: false });
}

async function startDevServices(): Promise<string> {
  mkdirSync(LOGS_DIR, { recursive: true });
  const apiPort = await findFreePort();
  const webPort = await findFreePort();

  const baseEnv = { ...process.env, FORCE_COLOR: "1" };

  // Spawn each child as its own process group so we can take down any
  // grandchildren (pnpm → node → tsx → server) on Electron exit with a
  // single signal.
  const detached = process.platform !== "win32";

  devServerProc = spawn(
    "pnpm",
    ["--filter", "@github-dashboard/server", "dev"],
    {
      cwd: REPO_ROOT,
      env: { ...baseEnv, PORT: String(apiPort) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      detached,
    },
  );
  tee(devServerProc, "server.log");

  devWebProc = spawn("pnpm", ["--filter", "@github-dashboard/web", "dev"], {
    cwd: REPO_ROOT,
    env: {
      ...baseEnv,
      GHD_API_PORT: String(apiPort),
      GHD_WEB_PORT: String(webPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    detached,
  });
  tee(devWebProc, "web.log");

  const webUrl = `http://localhost:${webPort}`;
  // Stable discovery file for tooling (Playwright MCP, etc.) so it can find
  // the current dev URL without hardcoding ports.
  writeFileSync(
    path.join(LOGS_DIR, "ports.json"),
    `${JSON.stringify({ api: apiPort, web: webPort, url: webUrl }, null, 2)}\n`,
  );

  await waitForUrl(webUrl);
  return webUrl;
}

function killGroup(proc: ChildProcess | null): void {
  if (!proc?.pid) return;
  try {
    if (process.platform === "win32") {
      proc.kill();
    } else {
      // Negative pid signals the whole process group (set up via `detached`),
      // which catches pnpm's intermediate node processes too.
      process.kill(-proc.pid, "SIGTERM");
    }
  } catch {
    // Already exited.
  }
}

function stopDevServices(): void {
  killGroup(devServerProc);
  devServerProc = null;
  killGroup(devWebProc);
  devWebProc = null;
}

async function waitForUrl(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // ignore — service still booting
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Dev service at ${url} failed to start within 30s`);
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (app.isPackaged) {
    await startEmbeddedServer();
    await mainWindow.loadURL(`http://localhost:${serverPort}/`);
  } else {
    const devUrl = await startDevServices();
    await mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Whether an update has been downloaded and is waiting to install. Held here
// so a renderer that mounts after `update-downloaded` fires can still query
// via `ghd:has-pending-update`.
let updatePending = false;

function announceUpdate(): void {
  updatePending = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("ghd:update-available");
  }
}

function setupAutoUpdater(): void {
  autoUpdater.on("update-downloaded", () => {
    announceUpdate();
  });

  autoUpdater.on("error", (err) => {
    console.error("Update error:", err);
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("Update check failed:", err);
    });
  };
  check();
  setInterval(check, UPDATE_CHECK_INTERVAL_MS).unref();
}

function simulateUpdate(): void {
  announceUpdate();
}

function buildAppMenu(): Menu {
  const isMac = process.platform === "darwin";
  const settingsItem: MenuItemConstructorOptions = {
    label: "Settings…",
    accelerator: "CmdOrCtrl+,",
    click: () => mainWindow?.webContents.send("ghd:open-settings"),
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              settingsItem,
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: "File",
      submenu: [
        // On non-mac, settings lives here since there's no app menu.
        ...(isMac ? [] : [settingsItem, { type: "separator" } as const]),
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    ...(!app.isPackaged
      ? ([
          {
            label: "Developer",
            submenu: [
              {
                label: "Simulate update available",
                type: "checkbox",
                checked: false,
                click: (menuItem) => {
                  if (menuItem.checked) simulateUpdate();
                },
              },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
  ];

  return Menu.buildFromTemplate(template);
}

ipcMain.handle("ghd:has-pending-update", () => updatePending);
ipcMain.handle("ghd:install-update", () => {
  // Dev/simulated path: no real download to install, so just relaunch so the
  // header button still has a visible effect when exercising the flow.
  if (!app.isPackaged) {
    app.relaunch();
    app.exit(0);
    return;
  }
  autoUpdater.quitAndInstall();
});

app.whenReady().then(async () => {
  // In packaged builds the dock icon comes from Contents/Resources/icon.icns
  // via Info.plist. In dev we run via `electron .`, which falls back to the
  // Electron framework icon — set it explicitly so the dev session matches.
  if (process.platform === "darwin" && !app.isPackaged) {
    app.dock?.setIcon(path.join(__dirname, "..", "build", "icon.png"));
  }
  Menu.setApplicationMenu(buildAppMenu());
  await createWindow();

  if (app.isPackaged) {
    setupAutoUpdater();
  }
});

app.on("will-quit", () => {
  stopDevServices();
});

app.on("window-all-closed", () => {
  app.quit();
});
