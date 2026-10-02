"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronsLeft,
  ChevronsRight,
  Home,
  Link2,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  Tag,
  Workflow,
} from "lucide-react";
import { Tooltip } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { Kbd, SiteIcon } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { applyTheme, cycleTheme, openPalette, THEME_LABEL, useThemePref, type ThemePref } from "@/lib/theme";
import { CollectionGlyph } from "@/features/links/collection-style";
import { Logo } from "./logo";
import { logoutAction } from "./actions";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { overlayOpen } from "@/lib/dom";

const NAV = [
  { href: "/", label: "Início", icon: Home, match: (p: string) => p === "/" },
  { href: "/plans", label: "Planner", icon: Workflow, match: (p: string) => p.startsWith("/plans") },
  { href: "/links", label: "Links", icon: Link2, match: (p: string) => p.startsWith("/links") },
  { href: "/tags", label: "Tags", icon: Tag, match: (p: string) => p.startsWith("/tags") },
];

export type RailPin =
  | { kind: "collection"; id: string; name: string; icon: string | null; color: string | null }
  | { kind: "plan"; id: string; name: string };

type Workspace = { id: string; name: string; role: string };

const RAIL_KEY = "wp-rail-expanded";

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};

/** Desktop navigation: a 64px icon rail that expands (button or "[") to show labels and pins. */
export function AppRail({
  user,
  workspace,
  workspaces,
  pins,
}: {
  user: { name: string; email: string };
  workspace: { id: string; name: string };
  workspaces: Workspace[];
  pins: RailPin[];
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const theme = useThemePref();
  const ThemeIcon = THEME_ICON[theme];
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    try {
      setExpanded(localStorage.getItem(RAIL_KEY) === "1");
    } catch {}
  }, []);
  const toggle = React.useCallback(() => {
    setExpanded((x) => {
      try {
        localStorage.setItem(RAIL_KEY, x ? "0" : "1");
      } catch {}
      return !x;
    });
  }, []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || overlayOpen()) return;
      // The planner editor uses [ and ] for z-order.
      if (document.querySelector(".wp-flow")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const item = (on: boolean) =>
    cn(
      "flex h-10 items-center gap-3 rounded-control text-muted transition-colors hover:bg-hover hover:text-ink [&>svg]:size-5 [&>svg]:shrink-0",
      expanded ? "w-full px-[10px]" : "w-10 justify-center",
      on && "bg-accent-soft text-accent-ink hover:bg-accent-soft hover:text-accent-ink",
    );
  const label = (text: string) => (expanded ? <span className="truncate text-body font-medium">{text}</span> : null);
  const tip = (content: string, node: React.ReactElement) =>
    expanded ? (
      node
    ) : (
      <Tooltip content={content} side="right">
        {node}
      </Tooltip>
    );

  return (
    <nav
      aria-label="Navegação principal"
      data-expanded={expanded || undefined}
      className={cn(
        "hidden shrink-0 flex-col gap-1.5 border-r border-line bg-surface py-3.5 transition-[width] duration-200 ease-[var(--ease-out)] sm:flex",
        expanded ? "w-[232px] px-3" : "w-16 items-center",
      )}
    >
      <div className={cn("mb-3 flex items-center gap-2.5", expanded ? "px-1" : "flex-col")}>
        <Link href="/" aria-label="Waypoint — início" className="shrink-0">
          <Logo />
        </Link>
        {expanded && (
          <WorkspaceSwitcher
            current={workspace}
            workspaces={workspaces}
            trigger={
              <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-hover">
                <span className="flex min-w-0 flex-col">
                  <span className="text-micro font-semibold uppercase tracking-[.08em] text-muted">Workspace</span>
                  <span className="truncate text-body font-semibold">{workspace.name}</span>
                </span>
              </button>
            }
          />
        )}
      </div>
      {NAV.map(({ href, label: text, icon: Icon, match }) => {
        const on = match(pathname);
        return (
          <React.Fragment key={href}>
            {tip(
              text,
              <Link href={href} aria-label={expanded ? undefined : text} aria-current={on ? "page" : undefined} className={item(on)}>
                <Icon strokeWidth={1.75} />
                {label(text)}
              </Link>,
            )}
          </React.Fragment>
        );
      })}
      {tip(
        "Buscar · ⌘K",
        <button type="button" aria-label={expanded ? undefined : "Buscar"} className={item(false)} onClick={() => openPalette()}>
          <Search strokeWidth={1.75} />
          {expanded && (
            <>
              <span className="flex-1 text-left text-body font-medium">Buscar</span>
              <Kbd>⌘K</Kbd>
            </>
          )}
        </button>,
      )}

      {expanded && pins.length > 0 && (
        <div className="mt-4 flex min-h-0 flex-col gap-0.5">
          <span className="px-[10px] pb-1 text-caption font-semibold uppercase tracking-[.06em] text-muted">Fixados</span>
          <div className="scrollbar-thin flex min-h-0 flex-col gap-0.5 overflow-y-auto">
            {pins.map((p) => {
              const href = p.kind === "plan" ? `/plans/${p.id}` : `/links?c=${p.id}`;
              const on = p.kind === "collection" ? pathname === "/links" && sp.get("c") === p.id : pathname.startsWith(href);
              return (
                <Link
                  key={`${p.kind}-${p.id}`}
                  href={href}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-chip px-[10px] text-body text-ink-2 hover:bg-hover hover:text-ink",
                    on && "bg-hover text-ink",
                  )}
                >
                  {p.kind === "plan" ? <Workflow className="size-4 shrink-0 text-muted" strokeWidth={1.75} /> : <CollectionGlyph icon={p.icon} color={p.color} size={16} />}
                  <span className="truncate">{p.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1" />
      {tip(
        `Tema: ${THEME_LABEL[theme].toLowerCase()}`,
        <button type="button" aria-label={`Alternar tema (atual: ${THEME_LABEL[theme].toLowerCase()})`} className={item(false)} onClick={() => cycleTheme()}>
          <ThemeIcon strokeWidth={1.75} />
          {label(`Tema ${THEME_LABEL[theme].toLowerCase()}`)}
        </button>,
      )}
      {tip(
        "Configurações",
        <Link
          href="/settings"
          aria-label={expanded ? undefined : "Configurações"}
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          className={item(pathname.startsWith("/settings"))}
        >
          <Settings strokeWidth={1.75} />
          {label("Configurações")}
        </Link>,
      )}
      {tip(
        expanded ? "Recolher · [" : "Expandir · [",
        <button type="button" aria-label={expanded ? "Recolher barra lateral" : "Expandir barra lateral"} aria-expanded={expanded} className={item(false)} onClick={toggle}>
          {expanded ? <ChevronsLeft strokeWidth={1.75} /> : <ChevronsRight strokeWidth={1.75} />}
          {label("Recolher")}
        </button>,
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Sua conta"
            className={cn("mt-1.5 flex items-center gap-2.5 rounded-control text-left hover:bg-hover", expanded ? "w-full px-1.5 py-1" : "h-8 w-8 justify-center rounded-full")}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-body font-semibold text-accent-ink">
              {(user.name.trim()[0] ?? "?").toUpperCase()}
            </span>
            {expanded && (
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body font-medium">{user.name}</span>
                <span className="truncate text-caption text-muted">{user.email}</span>
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end">
          <DropdownMenuLabel className="normal-case tracking-normal">
            <span className="block text-body font-semibold text-ink">{user.name}</span>
            <span className="block text-xs font-normal text-muted">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {!expanded && workspaces.length > 1 && (
            <>
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              <WorkspaceItems current={workspace} workspaces={workspaces} />
              <DropdownMenuSeparator />
            </>
          )}
          <ThemeItems current={theme} />
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logoutAction()}>
            <LogOut /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

function WorkspaceItems({ current, workspaces }: { current: { id: string }; workspaces: Workspace[] }) {
  const [, start] = React.useTransition();
  return workspaces.map((w) => (
    <DropdownMenuItem
      key={w.id}
      onSelect={() =>
        start(async () => {
          const { switchWorkspaceAction } = await import("./actions");
          await switchWorkspaceAction(w.id);
        })
      }
    >
      <SiteIcon label={w.name} size={18} />
      <span className="flex-1">{w.name}</span>
      {w.id === current.id && <Check className="text-accent-ink" />}
    </DropdownMenuItem>
  ));
}

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

function ThemeItems({ current }: { current: ThemePref }) {
  return (["light", "dark", "system"] as const).map((t) => {
    const Icon = THEME_ICON[t];
    return (
      <DropdownMenuItem key={t} onSelect={() => applyTheme(t)} aria-checked={current === t} role="menuitemradio">
        <Icon /> {t === "system" ? "Seguir sistema" : `Tema ${THEME_LABEL[t].toLowerCase()}`}
        {current === t && <Check className="ml-auto text-accent-ink" />}
      </DropdownMenuItem>
    );
  });
}

/** Phone layout: the rail becomes a bottom tab bar. */
export function MobileTabBar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const theme = useThemePref();
  const tab = "group/tab flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-caption font-medium text-muted [&_svg]:size-[22px]";
  // Active tab: a pill behind the icon (not just a color change).
  const pill = "flex h-7 w-12 items-center justify-center rounded-full transition-colors group-aria-[current=page]/tab:bg-accent-soft";
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      {NAV.slice(0, 3).map(({ href, label, icon: Icon, match }) => {
        const on = match(pathname);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cn(tab, on && "text-accent-ink")}>
            <span className={pill}>
              <Icon strokeWidth={1.75} />
            </span>
            {label}
          </Link>
        );
      })}
      <button type="button" className={tab} onClick={() => openPalette()}>
        <span className={pill}>
          <Search strokeWidth={1.75} />
        </span>
        Buscar
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-current={pathname.startsWith("/tags") || pathname.startsWith("/settings") ? "page" : undefined}
            className={cn(tab, (pathname.startsWith("/tags") || pathname.startsWith("/settings")) && "text-accent-ink")}
          >
            <span className={pill}>
              <Menu strokeWidth={1.75} />
            </span>
            Mais
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="mb-1">
          <DropdownMenuLabel className="normal-case tracking-normal">
            <span className="block text-body font-semibold text-ink">{user.name}</span>
            <span className="block text-xs font-normal text-muted">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/tags"><Tag /> Tags</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings"><Settings /> Configurações</Link>
          </DropdownMenuItem>
          <DropdownMenuLabel>Tema</DropdownMenuLabel>
          <ThemeItems current={theme} />
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logoutAction()}><LogOut /> Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
