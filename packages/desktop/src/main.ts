import { BrowserWindow, Menu, app, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { autoUpdater } from "electron-updater";
import net from "node:net";
import path from "node:path";

const DEV_WEB_URL = "http://localhost:7200";

let mainWindow: BrowserWindow | null = null;
let serverPort = 0;

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
  await waitForServer();
}

async function waitForServer(): Promise<void> {
  const url = `http://localhost:${serverPort}/api/instances`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 500) return;
    } catch {
      // ignore — server still booting
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Embedded server failed to start within 10s");
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

  if (app.isPackaged) {
    await startEmbeddedServer();
    await mainWindow.loadURL(`http://localhost:${serverPort}/`);
  } else {
    // Dev: assumes `pnpm dev` is running concurrently (Vite on 7200, Hono on 7100).
    await mainWindow.loadURL(DEV_WEB_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
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
  ];

  return Menu.buildFromTemplate(template);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(buildAppMenu());
  await createWindow();

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error("Update check failed:", err);
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
