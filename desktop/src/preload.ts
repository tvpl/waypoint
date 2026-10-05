import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

/**
 * The only surface the page gets from the desktop shell (window.waypointDesktop). The page
 * detects the desktop app by its presence; see src/lib/desktop.ts for the typed client side.
 */
contextBridge.exposeInMainWorld("waypointDesktop", {
  platform: process.platform,
  info: () => ipcRenderer.invoke("wp:info"),
  menu: () => ipcRenderer.invoke("wp:menu"),
  run: (id: string) => ipcRenderer.send("wp:run", id),
  openInMain: (path: string) => ipcRenderer.send("wp:open-main", path),
  setTheme: (pref: string, dark: boolean) => ipcRenderer.send("wp:theme", pref, dark),
  onCommand: (cb: (id: string, arg?: string) => void) => {
    const listener = (_: IpcRendererEvent, id: string, arg?: string) => cb(id, arg);
    ipcRenderer.on("wp:command", listener);
    return () => ipcRenderer.removeListener("wp:command", listener);
  },
  onWindowState: (cb: (state: { fullScreen: boolean; focused: boolean }) => void) => {
    const listener = (_: IpcRendererEvent, state: { fullScreen: boolean; focused: boolean }) => cb(state);
    ipcRenderer.on("wp:window-state", listener);
    return () => ipcRenderer.removeListener("wp:window-state", listener);
  },
});
