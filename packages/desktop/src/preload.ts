import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  onReloadConfig: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on("ghd:reload-config", listener);
    return () => ipcRenderer.off("ghd:reload-config", listener);
  },
  onUpdateAvailable: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on("ghd:update-available", listener);
    return () => ipcRenderer.off("ghd:update-available", listener);
  },
  hasPendingUpdate: (): Promise<boolean> =>
    ipcRenderer.invoke("ghd:has-pending-update"),
  installUpdate: (): Promise<void> => ipcRenderer.invoke("ghd:install-update"),
});
