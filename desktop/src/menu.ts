import { Menu, type MenuItemConstructorOptions } from "electron";

/**
 * One menu model feeds both the native menu (macOS menu bar, keyboard accelerators everywhere)
 * and the menu bar drawn inside the window's title bar on Windows/Linux (src/components/shell/
 * title-bar.tsx), so labels, shortcuts and state never drift apart.
 *
 * Ids starting with "app:" are run by the page (navigation, dialogs, theme); "role:" ids are
 * standard editing commands; anything else is handled in the main process (see main.ts).
 */
export type MenuEntry =
  | { type: "separator" }
  | {
      type?: "normal" | "checkbox" | "radio";
      id: string;
      label: string;
      accelerator?: string;
      checked?: boolean;
      enabled?: boolean;
      submenu?: MenuEntry[];
    };

export type TopMenu = { id: string; label: string; items: MenuEntry[] };

export type MenuState = {
  mac: boolean;
  theme: "light" | "dark" | "system";
  alwaysOnTop: boolean;
  fullScreen: boolean;
  closeToTray: boolean;
  portable: boolean;
};

const sep = { type: "separator" } as const;

export function menuModel(s: MenuState): TopMenu[] {
  const menus: TopMenu[] = [];
  if (s.mac) {
    menus.push({
      id: "app",
      label: "Waypoint",
      items: [
        { id: "about", label: "Sobre o Waypoint" },
        sep,
        { id: "app:go-settings", label: "Configurações…", accelerator: "Cmd+," },
        sep,
        { id: "role:hide", label: "Ocultar Waypoint", accelerator: "Cmd+H" },
        { id: "role:hideOthers", label: "Ocultar outros", accelerator: "Cmd+Alt+H" },
        { id: "role:unhide", label: "Mostrar tudo" },
        sep,
        { id: "quit", label: "Encerrar o Waypoint", accelerator: "Cmd+Q" },
      ],
    });
  }
  menus.push(
    {
      id: "file",
      label: "Arquivo",
      items: [
        { id: "app:new-plan", label: "Novo plan", accelerator: "CmdOrCtrl+N" },
        { id: "app:add-link", label: "Adicionar link", accelerator: "CmdOrCtrl+L" },
        { id: "app:paste-link", label: "Salvar link da área de transferência", accelerator: "CmdOrCtrl+Shift+L" },
        { id: "app:new-collection", label: "Nova coleção", accelerator: "CmdOrCtrl+Shift+N" },
        sep,
        { id: "new-window", label: "Nova janela", accelerator: "CmdOrCtrl+Alt+N" },
        sep,
        { id: "app:import", label: "Importar favoritos do navegador…" },
        {
          id: "export",
          label: "Exportar links",
          submenu: [
            { id: "app:export-html", label: "Favoritos (HTML)" },
            { id: "app:export-csv", label: "Planilha (CSV)" },
            { id: "app:export-json", label: "Dados (JSON)" },
          ],
        },
        sep,
        { id: "backup", label: "Fazer backup agora" },
        { id: "open-data", label: s.portable ? "Abrir pasta de dados (portátil)" : "Abrir pasta de dados" },
        ...(s.mac
          ? [sep, { id: "role:close", label: "Fechar janela", accelerator: "Cmd+W" }]
          : [sep, { id: "app:go-settings", label: "Configurações", accelerator: "Ctrl+," }, sep, { id: "quit", label: "Sair", accelerator: "Ctrl+Q" }]),
      ],
    },
    {
      id: "edit",
      label: "Editar",
      items: [
        { id: "role:undo", label: "Desfazer", accelerator: "CmdOrCtrl+Z" },
        { id: "role:redo", label: "Refazer", accelerator: "CmdOrCtrl+Shift+Z" },
        sep,
        { id: "role:cut", label: "Recortar", accelerator: "CmdOrCtrl+X" },
        { id: "role:copy", label: "Copiar", accelerator: "CmdOrCtrl+C" },
        { id: "role:paste", label: "Colar", accelerator: "CmdOrCtrl+V" },
        { id: "role:selectAll", label: "Selecionar tudo", accelerator: "CmdOrCtrl+A" },
        sep,
        { id: "app:palette", label: "Buscar em tudo…", accelerator: "CmdOrCtrl+K" },
      ],
    },
    {
      id: "view",
      label: "Exibir",
      items: [
        { id: "app:go-home", label: "Início", accelerator: "CmdOrCtrl+1" },
        { id: "app:go-plans", label: "Planner", accelerator: "CmdOrCtrl+2" },
        { id: "app:go-links", label: "Links", accelerator: "CmdOrCtrl+3" },
        { id: "app:go-tags", label: "Tags", accelerator: "CmdOrCtrl+4" },
        sep,
        { id: "app:toggle-rail", label: "Expandir ou recolher a barra lateral", accelerator: "CmdOrCtrl+B" },
        {
          id: "theme",
          label: "Tema",
          submenu: [
            { id: "app:theme-light", type: "radio", label: "Claro", checked: s.theme === "light" },
            { id: "app:theme-dark", type: "radio", label: "Escuro", checked: s.theme === "dark" },
            { id: "app:theme-system", type: "radio", label: "Igual ao sistema", checked: s.theme === "system" },
          ],
        },
        sep,
        { id: "zoom-in", label: "Aumentar zoom", accelerator: "CmdOrCtrl+=" },
        { id: "zoom-out", label: "Diminuir zoom", accelerator: "CmdOrCtrl+-" },
        { id: "zoom-reset", label: "Tamanho real", accelerator: "CmdOrCtrl+0" },
        sep,
        { id: "fullscreen", type: "checkbox", label: "Tela cheia", accelerator: s.mac ? "Ctrl+Cmd+F" : "F11", checked: s.fullScreen },
        sep,
        { id: "reload", label: "Recarregar", accelerator: "CmdOrCtrl+R" },
        { id: "devtools", label: "Ferramentas do desenvolvedor", accelerator: s.mac ? "Alt+Cmd+I" : "Ctrl+Shift+I" },
      ],
    },
    {
      id: "go",
      label: "Ir",
      items: [
        { id: "back", label: "Voltar", accelerator: s.mac ? "Cmd+[" : "Alt+Left" },
        { id: "forward", label: "Avançar", accelerator: s.mac ? "Cmd+]" : "Alt+Right" },
        sep,
        { id: "app:palette", label: "Buscar…", accelerator: "CmdOrCtrl+K" },
        sep,
        { id: "app:present", label: "Apresentar o plan aberto", accelerator: "F5" },
      ],
    },
    {
      id: "window",
      label: "Janela",
      items: [
        { id: "role:minimize", label: "Minimizar", accelerator: "CmdOrCtrl+M" },
        { id: "always-on-top", type: "checkbox", label: "Manter sobre as outras janelas", checked: s.alwaysOnTop },
        { id: "close-to-tray", type: "checkbox", label: s.mac ? "Continuar na barra de menus ao fechar" : "Continuar na bandeja ao fechar", checked: s.closeToTray },
      ],
    },
    {
      id: "help",
      label: "Ajuda",
      items: [
        { id: "app:shortcuts", label: "Atalhos de teclado", accelerator: "F1" },
        { id: "app:extension", label: "Extensão do navegador e tokens" },
        { id: "open-logs", label: "Abrir registros (logs)" },
        sep,
        { id: "about", label: "Sobre o Waypoint" },
      ],
    },
  );
  return menus;
}

const MAC_KEYS: Record<string, string> = { Cmd: "⌘", CmdOrCtrl: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Enter: "↵", Left: "←", Right: "→" };

/** "CmdOrCtrl+Shift+N" → "⇧⌘N" (macOS) or "Ctrl+Shift+N". */
export function formatAccelerator(acc: string, mac: boolean): string {
  const parts = acc.split("+").map((p) => (p === "" ? "+" : p));
  if (!mac) return parts.map((p) => (p === "CmdOrCtrl" || p === "Cmd" ? "Ctrl" : p === "Left" ? "←" : p === "Right" ? "→" : p)).join("+");
  const order = ["Ctrl", "Alt", "Shift", "Cmd", "CmdOrCtrl"];
  const mods = parts.slice(0, -1).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...mods, parts.at(-1)!].map((p) => MAC_KEYS[p] ?? p).join("");
}

/**
 * The model as the page gets it: the title bar draws it ("shortcut" is the display string) and,
 * on Windows/Linux, the page matches key presses against "accelerator" itself (see
 * src/components/shell/desktop-commands.tsx), since the native menu bar is hidden there.
 */
export function renderModel(menus: TopMenu[], mac: boolean) {
  const render = (items: MenuEntry[]): unknown[] =>
    items.map((e) => {
      if ("id" in e) {
        const { accelerator, submenu, ...rest } = e;
        return { ...rest, accelerator, shortcut: accelerator ? formatAccelerator(accelerator, mac) : undefined, submenu: submenu ? render(submenu) : undefined };
      }
      return e;
    });
  return menus.filter((m) => m.id !== "app").map((m) => ({ id: m.id, label: m.label, items: render(m.items) }));
}

const ROLES = new Set(["undo", "redo", "cut", "copy", "paste", "selectAll", "minimize", "close", "hide", "hideOthers", "unhide"]);

export function buildNativeMenu(menus: TopMenu[], run: (id: string) => void): Menu {
  const toNative = (items: MenuEntry[]): MenuItemConstructorOptions[] =>
    items.map((e): MenuItemConstructorOptions => {
      if (!("id" in e)) return { type: "separator" };
      const role = e.id.startsWith("role:") ? e.id.slice(5) : null;
      if (role && ROLES.has(role)) return { role: role as MenuItemConstructorOptions["role"], label: e.label, accelerator: e.accelerator };
      return {
        id: e.id,
        label: e.label,
        type: e.submenu ? "submenu" : (e.type ?? "normal"),
        accelerator: e.accelerator,
        checked: e.checked,
        enabled: e.enabled,
        submenu: e.submenu ? toNative(e.submenu) : undefined,
        click: e.submenu ? undefined : () => run(e.id),
      };
    });
  return Menu.buildFromTemplate(
    menus.map((m) => ({ label: m.label, role: m.id === "window" ? "windowMenu" : m.id === "help" ? "help" : undefined, submenu: toNative(m.items) })),
  );
}
