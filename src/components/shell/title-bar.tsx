"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menubar as MB } from "radix-ui";
import {
  AppWindow,
  Archive,
  ArrowLeft,
  ArrowRight,
  Braces,
  Check,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  FileCode,
  FileSpreadsheet,
  FolderOpen,
  FolderPlus,
  History,
  Home,
  Info,
  Keyboard,
  Link2,
  ListTodo,
  Lock,
  Maximize2,
  Minus,
  Monitor,
  Moon,
  PanelLeft,
  Pin,
  Power,
  Presentation,
  Puzzle,
  Redo2,
  RotateCw,
  Scan,
  Scissors,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Sun,
  SunMoon,
  Tag,
  TextCursor,
  Undo2,
  Upload,
  Workflow,
  Zap,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { getDesktop, useBackupState, type DesktopMenu, type DesktopMenuEntry } from "@/lib/desktop";
import { cycleTheme, openPalette, THEME_LABEL, useThemePref } from "@/lib/theme";
import { Kbd } from "@/components/ui/misc";
import { Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipProvider } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { DesktopSecurity } from "@/server/desktop-security";
import { lockNow, useDesktopCommand } from "./desktop-commands";

/** Icons for the menu entries (ids from desktop/src/menu.ts). */
const ICONS: Record<string, LucideIcon> = {
  "app:new-plan": Workflow,
  "app:add-link": Link2,
  "app:paste-link": ClipboardPaste,
  quick: Zap,
  "app:new-collection": FolderPlus,
  "new-window": AppWindow,
  "app:import": Upload,
  export: Download,
  "app:export-html": FileCode,
  "app:export-csv": FileSpreadsheet,
  "app:export-json": Braces,
  backup: Archive,
  "app:backups": History,
  "open-data": FolderOpen,
  "app:go-settings": Settings,
  quit: Power,
  "role:undo": Undo2,
  "role:redo": Redo2,
  "role:cut": Scissors,
  "role:copy": Copy,
  "role:paste": ClipboardPaste,
  "role:selectAll": TextCursor,
  "app:palette": Search,
  "app:go-home": Home,
  "app:go-plans": Workflow,
  "app:go-links": Link2,
  "app:go-tags": Tag,
  "app:go-tasks": ListTodo,
  "app:toggle-rail": PanelLeft,
  theme: SunMoon,
  "zoom-in": ZoomIn,
  "zoom-out": ZoomOut,
  "zoom-reset": Scan,
  fullscreen: Maximize2,
  reload: RotateCw,
  devtools: SquareTerminal,
  back: ArrowLeft,
  forward: ArrowRight,
  "app:present": Presentation,
  "role:minimize": Minus,
  "app:lock": Lock,
  "app:security": ShieldCheck,
  "always-on-top": Pin,
  "app:shortcuts": Keyboard,
  "app:extension": Puzzle,
  "open-logs": ScrollText,
  about: Info,
};

const content = "z-50 min-w-[252px] overflow-hidden rounded-xl border border-line bg-surface p-1.5 text-ink shadow-pop wp-float";
const item =
  "relative flex h-8 cursor-default select-none items-center gap-2.5 rounded-md px-2 text-body outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent-ink data-[state=open]:bg-hover [&_svg]:size-[15px] [&_svg]:shrink-0";
const trigger =
  "no-drag flex h-7 cursor-default select-none items-center rounded-md px-2.5 text-body text-ink-2 outline-none transition-colors hover:bg-hover hover:text-ink data-[highlighted]:bg-hover data-[state=open]:bg-hover data-[state=open]:text-ink";
const iconButton =
  "no-drag relative inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-[15px]";

function Entries({ entries, onRun }: { entries: DesktopMenuEntry[]; onRun: (id: string) => void }) {
  return entries.map((e, i) => {
    if (!("id" in e)) return <MB.Separator key={`sep-${i}`} className="mx-1.5 my-1 h-px bg-line" />;
    const Icon = ICONS[e.id];
    const lead = e.type === "checkbox" || e.type === "radio" ? (
      <span className="flex size-[15px] items-center justify-center">{e.checked && <Check strokeWidth={2.25} />}</span>
    ) : Icon ? (
      <Icon className="text-muted group-data-[highlighted]:text-accent-ink" strokeWidth={1.8} />
    ) : (
      <span className="size-[15px]" />
    );
    if (e.submenu) {
      return (
        <MB.Sub key={e.id}>
          <MB.SubTrigger className={cn(item, "group")}>
            {lead}
            {e.label}
            <ChevronRight className="ml-auto !size-[14px] text-muted" />
          </MB.SubTrigger>
          <MB.Portal>
            <MB.SubContent className={content} sideOffset={6} alignOffset={-6}>
              <Entries entries={e.submenu} onRun={onRun} />
            </MB.SubContent>
          </MB.Portal>
        </MB.Sub>
      );
    }
    return (
      <MB.Item key={e.id} className={cn(item, "group")} disabled={e.enabled === false} onSelect={() => onRun(e.id)}>
        {lead}
        {e.label}
        {e.shortcut && <span className="ml-auto pl-6 font-mono text-caption text-muted">{e.shortcut}</span>}
      </MB.Item>
    );
  });
}

/** Back/forward availability from the Navigation API (Chromium), kept in step with route changes. */
function useHistoryState() {
  const pathname = usePathname();
  const [state, setState] = React.useState({ back: false, forward: false });
  React.useEffect(() => {
    const nav = (window as unknown as { navigation?: EventTarget & { canGoBack: boolean; canGoForward: boolean } }).navigation;
    if (!nav) return setState({ back: true, forward: true });
    const read = () => setState({ back: nav.canGoBack, forward: nav.canGoForward });
    read();
    nav.addEventListener("currententrychange", read);
    return () => nav.removeEventListener("currententrychange", read);
  }, [pathname]);
  return state;
}

const DAY = 24 * 60 * 60 * 1000;

/** Title bar status for backups: green when recent, amber when stale or missing. Opens a summary. */
function BackupStatus() {
  const router = useRouter();
  const [state, act] = useBackupState();
  const [busy, setBusy] = React.useState(false);
  if (!state) return null;
  const fresh = !!state.lastAt && Date.now() - state.lastAt < (state.frequency === "weekly" ? 8 : 2) * DAY;
  return (
    <Popover>
      <Tooltip content={state.lastAt ? `Último backup ${timeAgo(state.lastAt)}` : "Nenhum backup ainda"}>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Backups" className={iconButton}>
            <History strokeWidth={1.9} />
            <span className={cn("absolute right-1 top-1 size-[7px] rounded-full ring-2 ring-surface", fresh ? "bg-success-ink" : "bg-amber-ink")} />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-[300px] p-0">
        <div className="flex flex-col gap-1 border-b border-line px-4 py-3">
          <span className="text-body font-semibold">{state.lastAt ? `Último backup ${timeAgo(state.lastAt)}` : "Nenhum backup ainda"}</span>
          <span className="text-caption text-muted">
            {state.frequency === "off" ? "Backup automático desligado" : `Automático ${state.frequency === "daily" ? "diário" : "semanal"}`} · {state.items.length}{" "}
            {state.items.length === 1 ? "cópia guardada" : "cópias guardadas"}
          </span>
        </div>
        <div className="flex gap-2 p-3">
          <Button
            size="sm"
            variant="primary"
            className="flex-1 justify-center"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await act("create").catch(() => {});
              setBusy(false);
            }}
          >
            <Archive /> {busy ? "Salvando…" : "Fazer backup"}
          </Button>
          <Button size="sm" className="flex-1 justify-center" onClick={() => router.push("/settings#backups")}>
            Gerenciar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

/**
 * Desktop app title bar (window drag area).
 *  - Windows/Linux: the app menu (same model as the native menu, desktop/src/menu.ts); the OS
 *    draws the window buttons on the right.
 *  - macOS: room for the traffic lights; the menu lives in the system menu bar.
 * Then back/forward, search in the middle and quick actions on the right: quick capture,
 * backup status, lock (when the app lock is on) and theme. `bare` (lock screen) keeps only the
 * drag area.
 */
export function TitleBar({ platform, security, bare }: { platform: string; security?: DesktopSecurity; bare?: boolean }) {
  const mac = platform === "darwin";
  const router = useRouter();
  const run = useDesktopCommand();
  const history = useHistoryState();
  const theme = useThemePref();
  const ThemeIcon = THEME_ICON[theme];
  const [menus, setMenus] = React.useState<DesktopMenu[]>([]);
  const [open, setOpen] = React.useState("");
  const menubar = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(() => {
    if (mac || bare) return;
    void getDesktop()
      ?.menu()
      .then((m) => setMenus(m ?? []));
  }, [mac, bare]);
  React.useEffect(load, [load]);

  // Windows convention: tapping Alt alone moves focus to the menu bar.
  React.useEffect(() => {
    if (mac || bare) return;
    let armed = false;
    const down = (e: KeyboardEvent) => (armed = e.key === "Alt" && !e.repeat && !e.ctrlKey && !e.shiftKey && !e.metaKey);
    const cancel = () => (armed = false);
    const up = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || !armed) return;
      armed = false;
      const first = menubar.current?.querySelector<HTMLElement>("[data-radix-collection-item]");
      if (!first) return;
      e.preventDefault();
      if (document.activeElement === first) first.blur();
      else first.focus();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("pointerdown", cancel, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("blur", cancel);
    };
  }, [mac, bare]);

  const tip = (content: string, node: React.ReactElement) => <Tooltip content={content}>{node}</Tooltip>;

  return (
    <TooltipProvider delayDuration={400}>
      <header
        className={cn(
          "wp-titlebar drag fixed inset-x-0 top-0 z-[45] flex h-[var(--titlebar-h)] select-none items-center gap-1 border-b border-line bg-surface/95 text-ink backdrop-blur",
          mac ? "pl-[84px] pr-2.5" : "pl-1.5 pr-[var(--titlebar-controls-w)]",
        )}
      >
        {bare ? (
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-body font-medium text-muted">Waypoint</span>
        ) : (
          <>
            {!mac && (
              <>
                <MB.Root
                  ref={menubar}
                  value={open}
                  onValueChange={(v) => {
                    setOpen(v);
                    if (v) load();
                  }}
                  className="flex items-center gap-0.5"
                  aria-label="Menu do aplicativo"
                >
                  {menus.map((m) => (
                    <MB.Menu key={m.id} value={m.id}>
                      <MB.Trigger className={trigger}>{m.label}</MB.Trigger>
                      <MB.Portal>
                        {/* Like native menus, closing hands focus back to the page, not the menu title. */}
                        <MB.Content className={content} align="start" sideOffset={6} loop onCloseAutoFocus={(e) => e.preventDefault()}>
                          <Entries entries={m.items} onRun={(id) => void run(id)} />
                        </MB.Content>
                      </MB.Portal>
                    </MB.Menu>
                  ))}
                </MB.Root>
                <span className="mx-1.5 h-4 w-px shrink-0 bg-line" aria-hidden />
              </>
            )}
            {tip(
              "Voltar",
              <button type="button" aria-label="Voltar" className={iconButton} disabled={!history.back} onClick={() => router.back()}>
                <ArrowLeft strokeWidth={1.9} />
              </button>,
            )}
            {tip(
              "Avançar",
              <button type="button" aria-label="Avançar" className={iconButton} disabled={!history.forward} onClick={() => window.history.forward()}>
                <ArrowRight strokeWidth={1.9} />
              </button>,
            )}

            <button
              type="button"
              onClick={() => openPalette()}
              className="no-drag absolute left-1/2 hidden h-7 w-[clamp(220px,30vw,440px)] -translate-x-1/2 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 text-body text-muted shadow-rest transition-colors hover:border-line-2 hover:text-ink-2 lg:flex"
            >
              <Search className="size-[14px] shrink-0" strokeWidth={1.9} />
              <span className="flex-1 truncate text-left">Buscar tarefas, plans, links…</span>
              <Kbd className="!py-0 text-[10px]">⌘K</Kbd>
            </button>

            <div className="ml-auto flex items-center gap-0.5">
              {tip(
                "Buscar",
                <button type="button" aria-label="Buscar" onClick={() => openPalette()} className={cn(iconButton, "lg:hidden")}>
                  <Search strokeWidth={1.9} />
                </button>,
              )}
              {tip(
                `Captura rápida · ${mac ? "⇧⌘Espaço" : "Ctrl+Shift+Espaço"}`,
                <button type="button" aria-label="Captura rápida" className={iconButton} onClick={() => getDesktop()?.run("quick")}>
                  <Zap strokeWidth={1.9} />
                </button>,
              )}
              <BackupStatus />
              {security?.lock &&
                tip(
                  "Bloquear agora",
                  <button type="button" aria-label="Bloquear agora" className={iconButton} onClick={() => void lockNow(router)}>
                    <Lock strokeWidth={1.9} />
                  </button>,
                )}
              {tip(
                `Tema: ${THEME_LABEL[theme].toLowerCase()}`,
                <button type="button" aria-label="Alternar tema" className={iconButton} onClick={() => cycleTheme()}>
                  <ThemeIcon strokeWidth={1.9} />
                </button>,
              )}
            </div>
          </>
        )}
      </header>
    </TooltipProvider>
  );
}
