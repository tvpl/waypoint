import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  session,
  shell,
  Tray,
  type BrowserWindowConstructorOptions,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type WebContents,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import { buildNativeMenu, menuModel, renderModel, type MenuState } from "./menu";
import { resolveDataLocation, SettingsStore } from "./paths";
import { DEFAULT_PORT, pickPort, startServer, type ServerHandle } from "./server";
import { splashHtml } from "./splash";

const mac = process.platform === "darwin";
const dev = process.argv.includes("--dev");
/** Height of the title bar the page draws (src/components/shell/title-bar.tsx). */
const TITLEBAR_H = 40;
/** Window buttons (Windows/Linux) stop above the title bar's bottom border. */
const OVERLAY_H = TITLEBAR_H - 1;
const QUICK_SHORTCUT = "CommandOrControl+Shift+Space";
const COMMAND_ARG = "--wp-command=";

app.setName("Waypoint");
const location = resolveDataLocation();
fs.mkdirSync(location.dir, { recursive: true });
// Portable: the browser profile (session cookie, theme, canvas positions) travels with the data.
// Set before the single-instance lock, which is keyed on it.
if (location.portable) app.setPath("userData", path.join(location.dir, "profile"));
if (process.platform === "win32") app.setAppUserModelId("app.waypoint.desktop");

const settings = new SettingsStore(path.join(location.dir, "desktop.json"));
nativeTheme.themeSource = settings.get("theme") ?? "system";

let server: ServerHandle | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
/** Commands that arrived before the page could take them (jump list, second launch). */
let pendingCommand: string | null = process.argv.find((a) => a.startsWith(COMMAND_ARG))?.slice(COMMAND_ARG.length) ?? null;

const assetsDir = path.join(__dirname, "..", "assets");
const asset = (name: string) => path.join(assetsDir, name);

// ---------------------------------------------------------------------------------------------
// Theme

const isDark = () => settings.get("dark") ?? nativeTheme.shouldUseDarkColors;
const chrome = (dark: boolean) =>
  dark ? { bg: "#0e0f12", bar: "#17181d", symbols: "#c4c5cf" } : { bg: "#f5f5f2", bar: "#ffffff", symbols: "#4a4b53" };

function paintWindow(win: BrowserWindow) {
  const c = chrome(isDark());
  win.setBackgroundColor(c.bg);
  try {
    if (!mac) win.setTitleBarOverlay({ color: c.bar, symbolColor: c.symbols, height: OVERLAY_H });
  } catch {} // windows without the overlay (print preview)
}

// ---------------------------------------------------------------------------------------------
// Windows

function windowOptions(): BrowserWindowConstructorOptions {
  const c = chrome(isDark());
  return {
    minWidth: 420,
    minHeight: 480,
    title: "Waypoint",
    show: false,
    backgroundColor: c.bg,
    titleBarStyle: "hidden",
    ...(mac
      ? { trafficLightPosition: { x: 16, y: (TITLEBAR_H - 14) / 2 } }
      : { titleBarOverlay: { color: c.bar, symbolColor: c.symbols, height: OVERLAY_H } }),
    icon: process.platform === "linux" ? asset("icon.png") : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  };
}

function createWindow(urlPath = "/", { main = false } = {}): BrowserWindow {
  const saved = main ? settings.get("bounds") : undefined;
  const win = new BrowserWindow({ ...windowOptions(), width: saved?.width ?? 1320, height: saved?.height ?? 860, x: saved?.x, y: saved?.y });
  if (saved?.maximized) win.maximize();
  // The page draws the menu in its title bar; the native one only backs the accelerators.
  if (!mac) win.setMenuBarVisibility(false);
  win.once("ready-to-show", () => win.show());
  watchWindowState(win);
  if (main) {
    mainWindow = win;
    rememberBounds(win);
    win.on("close", (e) => {
      if (!quitting && settings.get("closeToTray") && (tray || mac)) {
        e.preventDefault();
        win.hide();
      }
    });
    win.on("closed", () => (mainWindow = null));
  }
  if (server) void openApp(win, urlPath);
  else void win.loadURL(splashHtml(isDark()));
  return win;
}

async function openApp(win: BrowserWindow, urlPath = "/") {
  if (!server) return;
  await win.loadURL(server.origin + urlPath).catch(() => {});
}

function rememberBounds(win: BrowserWindow) {
  let t: NodeJS.Timeout | undefined;
  const save = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
      const maximized = win.isMaximized();
      const b = maximized ? (settings.get("bounds") ?? win.getNormalBounds()) : win.getBounds();
      settings.set("bounds", { x: b.x, y: b.y, width: b.width, height: b.height, maximized });
    }, 400);
  };
  for (const ev of ["resize", "move", "maximize", "unmaximize"] as const) win.on(ev as "resize", save);
}

function watchWindowState(win: BrowserWindow) {
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send("wp:window-state", { fullScreen: win.isFullScreen(), focused: win.isFocused() });
  };
  for (const ev of ["enter-full-screen", "leave-full-screen", "focus", "blur"] as const) win.on(ev as "focus", send);
  win.on("enter-full-screen", refreshMenu);
  win.on("leave-full-screen", refreshMenu);
}

function showMain(): BrowserWindow {
  const win = mainWindow ?? createWindow("/", { main: true });
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return win;
}

/** Sends a page command ("app:…") to a window, waiting for it to load if needed. */
function sendToPage(id: string, win: BrowserWindow = BrowserWindow.getFocusedWindow() ?? showMain()) {
  const wc = win.webContents;
  const send = () => wc.send("wp:command", id);
  if (!server || wc.isLoading() || !wc.getURL().startsWith(server.origin)) {
    pendingCommand = id;
    return;
  }
  send();
}

// ---------------------------------------------------------------------------------------------
// Commands (native menu, title bar menu, tray, dock, jump list)

function menuState(): MenuState {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  return {
    mac,
    theme: settings.get("theme") ?? "system",
    alwaysOnTop: !!win?.isAlwaysOnTop(),
    fullScreen: !!win?.isFullScreen(),
    closeToTray: !!settings.get("closeToTray"),
    portable: location.portable,
  };
}

function refreshMenu() {
  Menu.setApplicationMenu(buildNativeMenu(menuModel(menuState()), (id) => run(id)));
}

function run(id: string, from?: WebContents) {
  const win = (from && BrowserWindow.fromWebContents(from)) || BrowserWindow.getFocusedWindow() || mainWindow;
  const wc = win?.webContents;
  if (id.startsWith("app:")) return sendToPage(id, win ?? undefined);
  switch (id) {
    case "role:undo":
      return wc?.undo();
    case "role:redo":
      return wc?.redo();
    case "role:cut":
      return wc?.cut();
    case "role:copy":
      return wc?.copy();
    case "role:paste":
      return wc?.paste();
    case "role:selectAll":
      return wc?.selectAll();
    case "role:minimize":
      return win?.minimize();
    case "role:close":
      return win?.close();
    case "new-window":
      return void createWindow("/");
    case "backup":
      return void backup(false);
    case "open-data":
      return void shell.openPath(location.dir);
    case "open-logs":
      return void shell.openPath(path.join(location.dir, "logs"));
    case "reload":
      return wc?.reload();
    case "devtools":
      return wc?.toggleDevTools();
    case "zoom-in":
      return wc?.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 4));
    case "zoom-out":
      return wc?.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3));
    case "zoom-reset":
      return wc?.setZoomLevel(0);
    case "fullscreen":
      win?.setFullScreen(!win.isFullScreen());
      return refreshMenu();
    case "back":
      return wc?.navigationHistory.canGoBack() && wc.navigationHistory.goBack();
    case "forward":
      return wc?.navigationHistory.canGoForward() && wc.navigationHistory.goForward();
    case "always-on-top":
      win?.setAlwaysOnTop(!win.isAlwaysOnTop());
      return refreshMenu();
    case "close-to-tray":
      settings.set("closeToTray", !settings.get("closeToTray"));
      refreshMenu();
      return refreshTray();
    case "about":
      return void about(win ?? undefined);
    case "quit":
      return app.quit();
    case "show":
      return void showMain();
  }
}

async function backup(auto: boolean) {
  if (!server) return;
  try {
    const res = await fetch(`${server.origin}/api/desktop/backup`, {
      method: "POST",
      headers: { "x-waypoint-desktop": server.secret, "content-type": "application/json" },
      body: JSON.stringify({ auto }),
    });
    const body = (await res.json()) as { file?: string; error?: string };
    if (!res.ok || !body.file) throw new Error(body.error ?? `HTTP ${res.status}`);
    if (auto) return;
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const opts = { type: "info" as const, message: "Backup salvo", detail: body.file, buttons: ["Mostrar na pasta", "OK"], defaultId: 1, cancelId: 1 };
    const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (response === 0) shell.showItemInFolder(body.file);
  } catch (e) {
    if (!auto) dialog.showErrorBox("Não foi possível fazer o backup", String(e instanceof Error ? e.message : e));
    else console.error("[waypoint] auto backup failed", e);
  }
}

async function about(win?: BrowserWindow) {
  const detail = [
    `Versão ${app.getVersion()} · Electron ${process.versions.electron}`,
    "",
    `Dados${location.portable ? " (modo portátil)" : ""}:`,
    location.dir,
    "",
    `Endereço local para a extensão do navegador: ${server?.origin ?? "—"}`,
  ].join("\n");
  const opts = { type: "info" as const, title: "Sobre o Waypoint", message: "Waypoint", detail, buttons: ["Abrir pasta de dados", "Copiar endereço", "OK"], defaultId: 2, cancelId: 2 };
  const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
  if (response === 0) void shell.openPath(location.dir);
  if (response === 1 && server) clipboard.writeText(server.origin);
}

// ---------------------------------------------------------------------------------------------
// Tray, dock, jump list, global shortcut

function trayMenu(): Menu {
  const items: MenuItemConstructorOptions[] = [
    { label: "Abrir o Waypoint", click: () => showMain() },
    { label: "Buscar…", accelerator: QUICK_SHORTCUT, click: () => (showMain(), sendToPage("app:palette", mainWindow!)) },
    { type: "separator" },
    { label: "Novo plan", click: () => (showMain(), sendToPage("app:new-plan", mainWindow!)) },
    { label: "Adicionar link", click: () => (showMain(), sendToPage("app:add-link", mainWindow!)) },
    { label: "Salvar link da área de transferência", click: () => (showMain(), sendToPage("app:paste-link", mainWindow!)) },
    { type: "separator" },
    { label: "Continuar aqui ao fechar a janela", type: "checkbox", checked: !!settings.get("closeToTray"), click: () => run("close-to-tray") },
    { label: "Fazer backup agora", click: () => void backup(false) },
    { label: "Abrir pasta de dados", click: () => void shell.openPath(location.dir) },
    { type: "separator" },
    { label: "Sair", click: () => app.quit() },
  ];
  return Menu.buildFromTemplate(items);
}

function createTray() {
  const icon = nativeImage.createFromPath(asset(mac ? "trayTemplate.png" : "tray.png"));
  if (icon.isEmpty()) return;
  if (mac) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Waypoint");
  tray.setContextMenu(trayMenu());
  if (!mac) tray.on("click", () => (mainWindow?.isVisible() && mainWindow.isFocused() ? mainWindow.hide() : showMain()));
}

function refreshTray() {
  tray?.setContextMenu(trayMenu());
}

function setupShellIntegration() {
  if (mac) {
    app.dock?.setMenu(
      Menu.buildFromTemplate([
        { label: "Novo plan", click: () => (showMain(), sendToPage("app:new-plan", mainWindow!)) },
        { label: "Adicionar link", click: () => (showMain(), sendToPage("app:add-link", mainWindow!)) },
        { label: "Buscar…", click: () => (showMain(), sendToPage("app:palette", mainWindow!)) },
      ]),
    );
  }
  if (process.platform === "win32") {
    // The portable .exe runs from a temporary copy: tasks must start the portable file itself.
    const program = process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath;
    const task = (title: string, command: string) => ({
      program,
      arguments: `${COMMAND_ARG}${command}`,
      title,
      description: title,
      iconPath: program,
      iconIndex: 0,
    });
    app.setUserTasks([task("Novo plan", "app:new-plan"), task("Adicionar link", "app:add-link"), task("Buscar", "app:palette")]);
  }
  try {
    globalShortcut.register(QUICK_SHORTCUT, () => {
      const win = showMain();
      sendToPage("app:palette", win);
    });
  } catch (e) {
    console.error("[waypoint] global shortcut unavailable", e);
  }
}

// ---------------------------------------------------------------------------------------------
// Security: what pages may open, navigate to and ask for

function isAppUrl(url: string) {
  return !!server && (url === server.origin || url.startsWith(server.origin + "/"));
}

function openExternal(url: string) {
  if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
}

function contextMenu(wc: WebContents, p: Electron.ContextMenuParams) {
  const items: MenuItemConstructorOptions[] = [];
  for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => wc.replaceMisspelling(s) });
  if (p.misspelledWord) {
    items.push({ label: "Adicionar ao dicionário", click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
    items.push({ type: "separator" });
  }
  if (p.linkURL && !isAppUrl(p.linkURL)) {
    items.push({ label: "Abrir no navegador", click: () => openExternal(p.linkURL) });
    items.push({ label: "Copiar endereço do link", click: () => clipboard.writeText(p.linkURL) });
    items.push({ type: "separator" });
  }
  if (p.mediaType === "image" && p.srcURL) {
    items.push({ label: "Copiar imagem", click: () => wc.copyImageAt(p.x, p.y) });
    items.push({ label: "Salvar imagem como…", click: () => wc.downloadURL(p.srcURL) });
    items.push({ type: "separator" });
  }
  if (p.isEditable) {
    items.push(
      { label: "Recortar", role: "cut", enabled: p.editFlags.canCut },
      { label: "Copiar", role: "copy", enabled: p.editFlags.canCopy },
      { label: "Colar", role: "paste", enabled: p.editFlags.canPaste },
      { label: "Selecionar tudo", role: "selectAll" },
    );
  } else if (p.selectionText.trim()) {
    items.push({ label: "Copiar", role: "copy" });
  }
  while (items.at(-1)?.type === "separator") items.pop();
  if (items.length) Menu.buildFromTemplate(items).popup();
}

app.on("web-contents-created", (_, wc) => {
  wc.setWindowOpenHandler(({ url }) => {
    // Plans, versions and other app pages open in another app window.
    if (isAppUrl(url)) return { action: "allow", overrideBrowserWindowOptions: { ...windowOptions(), width: 1200, height: 800 } };
    // The planner's "export PDF" writes a printable page into a blank window.
    if (url === "about:blank" || url === "") {
      return { action: "allow", overrideBrowserWindowOptions: { width: 960, height: 720, autoHideMenuBar: true, title: "Waypoint", webPreferences: { sandbox: true } } };
    }
    openExternal(url);
    return { action: "deny" };
  });
  wc.on("did-create-window", (win) => {
    if (!mac) win.setMenuBarVisibility(false);
    if (win.webContents.getURL() === "about:blank") return;
    win.once("ready-to-show", () => win.show());
    watchWindowState(win);
  });
  wc.on("will-navigate", (e, url) => {
    if (isAppUrl(url) || url.startsWith("data:text/html")) return;
    e.preventDefault();
    openExternal(url);
  });
  wc.on("context-menu", (_, params) => contextMenu(wc, params));
  wc.on("did-finish-load", () => {
    if (!pendingCommand || !server || !wc.getURL().startsWith(server.origin)) return;
    const id = pendingCommand;
    pendingCommand = null;
    // Give React a moment to hydrate and subscribe to commands.
    setTimeout(() => wc.send("wp:command", id), 600);
  });
});

function lockDownSession() {
  const allowed = new Set(["clipboard-read", "clipboard-sanitized-write", "fullscreen"]);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(isAppUrl(wc.getURL()) && allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => !!wc && isAppUrl(wc.getURL()) && allowed.has(permission));
}

// ---------------------------------------------------------------------------------------------
// IPC (only from app pages)

const fromApp = (e: IpcMainEvent | IpcMainInvokeEvent) => !!e.senderFrame && isAppUrl(e.senderFrame.url);

ipcMain.handle("wp:info", (e) => {
  if (!fromApp(e)) return null;
  return {
    version: app.getVersion(),
    platform: process.platform,
    dataDir: location.dir,
    portable: location.portable,
    origin: server?.origin,
    quickShortcut: QUICK_SHORTCUT,
    closeToTray: !!settings.get("closeToTray"),
  };
});

ipcMain.handle("wp:menu", (e) => (fromApp(e) ? renderModel(menuModel(menuState()), mac) : []));

ipcMain.on("wp:run", (e, id: unknown) => {
  if (fromApp(e) && typeof id === "string") run(id, e.sender);
});

ipcMain.on("wp:theme", (e, pref: unknown, dark: unknown) => {
  if (!fromApp(e) || !["light", "dark", "system"].includes(pref as string)) return;
  const changed = settings.get("theme") !== pref || settings.get("dark") !== !!dark;
  if (!changed) return;
  settings.set("theme", pref as "light" | "dark" | "system");
  settings.set("dark", !!dark);
  nativeTheme.themeSource = pref as "light" | "dark" | "system";
  BrowserWindow.getAllWindows().forEach(paintWindow);
  refreshMenu();
});

// ---------------------------------------------------------------------------------------------
// Lifecycle

async function boot() {
  const port = await pickPort(settings.get("port") ?? DEFAULT_PORT);
  if (port !== settings.get("port")) settings.set("port", port);
  server = await startServer({ port, dataDir: location.dir, dev });
  await session.defaultSession.cookies.set({ url: server.origin, name: "wp_desktop", value: server.secret, httpOnly: true, sameSite: "strict" });
  server.onExit(async (code) => {
    if (quitting) return;
    server = null;
    const { response } = await dialog.showMessageBox({
      type: "error",
      message: "O servidor do Waypoint parou",
      detail: `Código ${code}. Os registros estão em ${path.join(location.dir, "logs")}.`,
      buttons: ["Reiniciar", "Sair"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 1) return app.quit();
    await startOrFail();
  });
  for (const win of BrowserWindow.getAllWindows()) {
    const url = win.webContents.getURL();
    void openApp(win, url.startsWith("http") ? new URL(url).pathname + new URL(url).search : "/");
  }
  setTimeout(() => void backup(true), 15_000);
}

async function startOrFail() {
  try {
    await boot();
  } catch (e) {
    const { response } = await dialog.showMessageBox({
      type: "error",
      message: "Não foi possível iniciar o Waypoint",
      detail: String(e instanceof Error ? e.message : e),
      buttons: ["Tentar de novo", "Abrir registros", "Sair"],
      defaultId: 0,
      cancelId: 2,
    });
    if (response === 0) return startOrFail();
    if (response === 1) await shell.openPath(path.join(location.dir, "logs"));
    app.quit();
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_, argv) => {
    const win = showMain();
    const command = argv.find((a) => a.startsWith(COMMAND_ARG))?.slice(COMMAND_ARG.length);
    if (command?.startsWith("app:")) sendToPage(command, win);
  });

  app.whenReady().then(async () => {
    lockDownSession();
    refreshMenu();
    createWindow("/", { main: true });
    createTray();
    setupShellIntegration();
    await startOrFail();
  });

  app.on("activate", () => showMain());
  app.on("before-quit", () => (quitting = true));
  app.on("window-all-closed", () => {
    if (!mac) app.quit();
  });
  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    server?.stop();
  });
}
