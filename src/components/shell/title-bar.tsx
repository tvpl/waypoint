"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Menubar as MB } from "radix-ui";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDesktop, type DesktopMenu, type DesktopMenuEntry } from "@/lib/desktop";
import { openPalette } from "@/lib/theme";
import { Kbd } from "@/components/ui/misc";
import { useDesktopCommand } from "./desktop-commands";

const content =
  "z-50 min-w-[236px] overflow-hidden rounded-xl border border-line bg-surface p-1.5 text-ink shadow-pop wp-float";
const item =
  "relative flex h-8 cursor-default select-none items-center gap-2 rounded-md pl-7 pr-2.5 text-body outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent-ink data-[state=open]:bg-hover";
const trigger =
  "no-drag flex h-7 cursor-default select-none items-center rounded-md px-2.5 text-body text-ink-2 outline-none transition-colors hover:bg-hover hover:text-ink data-[highlighted]:bg-hover data-[state=open]:bg-hover data-[state=open]:text-ink";
const iconButton =
  "no-drag inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink [&_svg]:size-[15px]";

function Entries({ entries, onRun }: { entries: DesktopMenuEntry[]; onRun: (id: string) => void }) {
  return entries.map((e, i) => {
    if (!("id" in e)) return <MB.Separator key={`sep-${i}`} className="mx-1.5 my-1 h-px bg-line" />;
    if (e.submenu) {
      return (
        <MB.Sub key={e.id}>
          <MB.SubTrigger className={item}>
            {e.label}
            <ChevronRight className="ml-auto size-[14px] text-muted" />
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
      <MB.Item key={e.id} className={item} disabled={e.enabled === false} onSelect={() => onRun(e.id)}>
        {e.checked && <Check className="absolute left-2 size-[14px]" strokeWidth={2.25} />}
        {e.label}
        {e.shortcut && <span className="ml-auto pl-6 font-mono text-caption text-muted">{e.shortcut}</span>}
      </MB.Item>
    );
  });
}

/**
 * Desktop app title bar (window drag area). Windows/Linux: the app menu (same model as the
 * native menu, see desktop/src/menu.ts), back/forward and search; the OS draws the window
 * buttons on the right. macOS: room for the traffic lights, back/forward and search; the menu
 * lives in the system menu bar.
 */
export function TitleBar({ platform }: { platform: string }) {
  const mac = platform === "darwin";
  const router = useRouter();
  const run = useDesktopCommand();
  const [menus, setMenus] = React.useState<DesktopMenu[]>([]);
  const [open, setOpen] = React.useState("");
  const menubar = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(() => {
    if (mac) return;
    void getDesktop()
      ?.menu()
      .then((m) => setMenus(m ?? []));
  }, [mac]);
  React.useEffect(load, [load]);

  // Windows convention: tapping Alt alone moves focus to the menu bar.
  React.useEffect(() => {
    if (mac) return;
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
  }, [mac]);

  return (
    <header
      className={cn(
        "wp-titlebar drag fixed inset-x-0 top-0 z-[45] flex h-[var(--titlebar-h)] select-none items-center gap-1 border-b border-line bg-surface text-ink",
        mac ? "pl-[84px] pr-3" : "pl-1.5 pr-[var(--titlebar-controls-w)]",
      )}
    >
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
      <button type="button" aria-label="Voltar" title="Voltar" className={iconButton} onClick={() => router.back()}>
        <ArrowLeft strokeWidth={1.9} />
      </button>
      <button type="button" aria-label="Avançar" title="Avançar" className={iconButton} onClick={() => window.history.forward()}>
        <ArrowRight strokeWidth={1.9} />
      </button>

      <button
        type="button"
        onClick={() => openPalette()}
        className="no-drag absolute left-1/2 hidden h-7 w-[clamp(220px,30vw,440px)] -translate-x-1/2 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 text-body text-muted transition-colors hover:border-line-2 hover:text-ink-2 md:flex"
      >
        <Search className="size-[14px] shrink-0" strokeWidth={1.9} />
        <span className="flex-1 truncate text-left">Buscar plans, links, coleções…</span>
        <Kbd className="!py-0 text-[10px]">⌘K</Kbd>
      </button>
      <button type="button" aria-label="Buscar" onClick={() => openPalette()} className={cn(iconButton, "ml-auto md:hidden")}>
        <Search strokeWidth={1.9} />
      </button>
    </header>
  );
}
