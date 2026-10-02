"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Workflow, Link2, Tag, Search, Moon, Sun, Monitor, Settings, LogOut, Menu } from "lucide-react";
import { Tooltip } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { applyTheme, cycleTheme, getThemePref, openPalette, type ThemePref } from "@/lib/theme";
import { Logo } from "./logo";
import { logoutAction } from "./actions";

const NAV = [
  { href: "/", label: "Início", icon: Home, match: (p: string) => p === "/" },
  { href: "/plans", label: "Planner", icon: Workflow, match: (p: string) => p.startsWith("/plans") },
  { href: "/links", label: "Links", icon: Link2, match: (p: string) => p.startsWith("/links") },
  { href: "/tags", label: "Tags", icon: Tag, match: (p: string) => p.startsWith("/tags") },
];

const itemCls = "flex h-10 w-10 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-hover hover:text-ink [&_svg]:size-5";

export function AppRail({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemePref>("system");
  useEffect(() => setTheme(getThemePref()), []);
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <nav aria-label="Navegação principal" className="hidden w-16 shrink-0 flex-col items-center gap-1.5 border-r border-line bg-surface py-3.5 sm:flex">
      <Link href="/" aria-label="Waypoint — início" className="mb-3.5">
        <Logo />
      </Link>
      {NAV.map(({ href, label, icon: Icon, match }) => {
        const on = match(pathname);
        return (
          <Tooltip key={href} content={label} side="right">
            <Link href={href} aria-label={label} aria-current={on ? "page" : undefined} className={cn(itemCls, on && "bg-accent-soft text-accent-ink hover:bg-accent-soft hover:text-accent-ink")}>
              <Icon strokeWidth={1.75} />
            </Link>
          </Tooltip>
        );
      })}
      <Tooltip content={<span>Buscar · ⌘K</span>} side="right">
        <button type="button" aria-label="Buscar" className={itemCls} onClick={() => openPalette()}>
          <Search strokeWidth={1.75} />
        </button>
      </Tooltip>
      <div className="flex-1" />
      <Tooltip content={`Tema: ${theme === "dark" ? "escuro" : theme === "light" ? "claro" : "sistema"}`} side="right">
        <button type="button" aria-label="Alternar tema" className={itemCls} onClick={() => setTheme(cycleTheme())}>
          <ThemeIcon strokeWidth={1.75} />
        </button>
      </Tooltip>
      <Tooltip content="Configurações" side="right">
        <Link href="/settings" aria-label="Configurações" className={cn(itemCls, pathname.startsWith("/settings") && "bg-accent-soft text-accent-ink")}>
          <Settings strokeWidth={1.75} />
        </Link>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Sua conta" className="mt-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-ink">
            {(user.name.trim()[0] ?? "?").toUpperCase()}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end">
          <DropdownMenuLabel className="normal-case tracking-normal">
            <span className="block text-[13px] font-semibold text-ink">{user.name}</span>
            <span className="block text-xs font-normal text-muted">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { applyTheme("light"); setTheme("light"); }}><Sun /> Tema claro</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { applyTheme("dark"); setTheme("dark"); }}><Moon /> Tema escuro</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { applyTheme("system"); setTheme("system"); }}><Monitor /> Seguir sistema</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logoutAction()}><LogOut /> Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

/** Phone layout: the rail becomes a bottom tab bar. */
export function MobileTabBar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const tab = "flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted [&_svg]:size-[22px]";
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      {NAV.slice(0, 3).map(({ href, label, icon: Icon, match }) => {
        const on = match(pathname);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cn(tab, on && "text-accent-ink")}>
            <Icon strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
      <button type="button" className={tab} onClick={() => openPalette()}>
        <Search strokeWidth={1.75} />
        Buscar
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(tab, (pathname.startsWith("/tags") || pathname.startsWith("/settings")) && "text-accent-ink")}>
            <Menu strokeWidth={1.75} />
            Mais
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="mb-1">
          <DropdownMenuLabel className="normal-case tracking-normal">
            <span className="block text-[13px] font-semibold text-ink">{user.name}</span>
            <span className="block text-xs font-normal text-muted">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/tags"><Tag /> Tags</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings"><Settings /> Configurações</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => cycleTheme()}><Moon /> Alternar tema</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => logoutAction()}><LogOut /> Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
