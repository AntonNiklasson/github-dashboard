import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  onOpenSettings: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on("ghd:open-settings", listener);
    return () => ipcRenderer.off("ghd:open-settings", listener);
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
