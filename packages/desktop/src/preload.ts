import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  onOpenSettings: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on("ghd:open-settings", listener);
    return () => ipcRenderer.off("ghd:open-settings", listener);
  },
});
