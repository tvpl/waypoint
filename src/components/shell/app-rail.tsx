"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarCheck,
  Check,
  CircleHelp,
  Keyboard,
  LifeBuoy,
  PlayCircle,
  ListTodo,
  Eye,
  FileBarChart2,
  FolderInput,
  Home,
  Inbox,
  KeyRound,
  Library,
  Link2,
  Loader2,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Palette,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Tag,
  Trash2,
  User,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { HoverCard } from "radix-ui";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { Kbd, SiteIcon } from "@/components/ui/misc";
import { PlanThumb } from "@/components/plan-thumb";
import { cn } from "@/lib/utils";
import { applyTheme, openPalette, THEME_LABEL, useThemePref, type ThemePref } from "@/lib/theme";
import { CollectionGlyph } from "@/features/links/collection-style";
import { createPlanAction } from "@/app/(app)/plans/actions";
import type { RailResponse } from "@/app/api/rail/route";
import { Logo } from "./logo";
import { logoutAction } from "./actions";
import { overlayOpen } from "@/lib/dom";
import { TOGGLE_RAIL_EVENT, useDesktop } from "@/lib/desktop";
import { helpModuleFor } from "@/features/help/guides";
import { startTour } from "@/features/help/events";
import { openShortcuts } from "./shortcuts";
import { NotificationsPanel, UnreadBadge, unreadLabel, useNotifications } from "./notifications";

const NAV = [
  { href: "/", label: "Início", icon: Home, match: (p: string) => p === "/" },
  { href: "/plans", label: "Planner", icon: Workflow, match: (p: string) => p.startsWith("/plans") },
  { href: "/links", label: "Links", icon: Link2, match: (p: string) => p.startsWith("/links") },
  { href: "/tasks", label: "Tarefas", icon: ListTodo, match: (p: string) => p.startsWith("/tasks") },
  { href: "/tags", label: "Tags", icon: Tag, match: (p: string) => p.startsWith("/tags") },
];

export type RailPin =
  | { kind: "collection"; id: string; name: string; icon: string | null; color: string | null }
  | { kind: "plan"; id: string; name: string };

type Workspace = { id: string; name: string; role: string };

const HIDDEN_KEY = "wp-rail-hidden";

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};

// ------------------------------------------------------------------ hover cards' data

let railCache: { at: number; data: RailResponse } | null = null;
let railInflight: Promise<RailResponse | null> | null = null;

/** Recent plans, inbox and tags for the hover cards: fetched when a card first opens, kept for 30 s. */
function useRailData(active: boolean) {
  const [data, setData] = React.useState<RailResponse | null>(railCache?.data ?? null);
  React.useEffect(() => {
    if (!active) return;
    if (railCache && Date.now() - railCache.at < 30_000) return setData(railCache.data);
    railInflight ??= fetch("/api/rail", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<RailResponse>) : null))
      .catch(() => null)
      .finally(() => (railInflight = null));
    let alive = true;
    void railInflight.then((d) => {
      if (d) railCache = { at: Date.now(), data: d };
      if (alive && d) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [active]);
  return data;
}

/**
 * Navigation rail: a compact column of large icons with short labels. Hovering (or focusing) an
 * item opens its own card beside it with what is useful there: recent plans, the inbox, tasks,
 * tags, settings sections. The bell opens the notification center; the theme lives in the
 * account menu. Sized to fit a 700px-tall window. ⌘B / "[" hides or shows the whole rail.
 */
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
  const theme = useThemePref();
  const [hidden, setHidden] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);
  const data = useRailData(open !== null);

  React.useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === "1");
    } catch {}
  }, []);
  const toggle = React.useCallback(() => {
    setHidden((x) => {
      try {
        localStorage.setItem(HIDDEN_KEY, x ? "0" : "1");
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
    window.addEventListener(TOGGLE_RAIL_EVENT, toggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(TOGGLE_RAIL_EVENT, toggle);
    };
  }, [toggle]);

  const card = (id: string) => ({ open: open === id, onOpenChange: (o: boolean) => setOpen((cur) => (o ? id : cur === id ? null : cur)) });
  const collections = pins.filter((p): p is Extract<RailPin, { kind: "collection" }> => p.kind === "collection");
  const pinnedPlans = pins.filter((p): p is Extract<RailPin, { kind: "plan" }> => p.kind === "plan");

  return (
    <nav
      aria-label="Navegação principal"
      className={cn("scrollbar-none w-[76px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-line bg-surface py-2.5", hidden ? "hidden" : "hidden sm:flex")}
    >
      <Link href="/" aria-label="Waypoint — início" className="mb-2 shrink-0">
        <Logo />
      </Link>

      <RailCard {...card("home")} trigger={<RailLink href="/" label="Início" icon={Home} on={NAV[0].match(pathname)} data-tour="nav-home" />}>
        <CardHead icon={Home} title="Início" text={`Sua mesa de trabalho em ${workspace.name}.`} />
        <CardList>
          <CardRow href="/plans" icon={Workflow} label="Todos os plans" />
          <CardRow href="/links?scope=inbox" icon={Inbox} label="Caixa de entrada" meta={data?.inbox || undefined} />
          <CardRow onSelect={() => openPalette()} icon={Search} label="Buscar" kbd="⌘K" />
        </CardList>
      </RailCard>

      <RailCard {...card("plans")} trigger={<RailLink href="/plans" label="Planner" icon={Workflow} on={NAV[1].match(pathname)} data-tour="nav-plans" />}>
        <CardHead icon={Workflow} title="Planner" text="Diagramas, mapas e arquiteturas." />
        <CardSection label="Recentes">
          {data ? (
            data.plans.length ? (
              data.plans.map((p) => (
                <Link key={p.id} href={`/plans/${p.id}/edit`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <span className="w-[46px] shrink-0 overflow-hidden rounded-md border border-line bg-surface-2">
                    <PlanThumb thumb={p.thumbnail} height={30} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body">{p.title}</span>
                </Link>
              ))
            ) : (
              <p className="px-2 py-1.5 text-body text-muted">Nenhum plan ainda.</p>
            )
          ) : (
            <CardLoading />
          )}
        </CardSection>
        {pinnedPlans.length > 0 && (
          <CardSection label="Fixados">
            {pinnedPlans.map((p) => (
              <CardRow key={p.id} href={`/plans/${p.id}`} icon={Workflow} label={p.name} />
            ))}
          </CardSection>
        )}
        <CardFoot>
          <NewPlanButton />
          <CardFootLink href="/plans">Todos os plans</CardFootLink>
        </CardFoot>
      </RailCard>

      <RailCard {...card("links")} trigger={<RailLink href="/links" label="Links" icon={Link2} on={NAV[2].match(pathname)} data-tour="nav-links" />}>
        <CardHead icon={Link2} title="Links" text="Sua biblioteca de favoritos e coleções." />
        <CardList>
          <CardRow href="/links?scope=inbox" icon={Inbox} label="Caixa de entrada" meta={data?.inbox || undefined} accent={!!data?.inbox} />
          <CardRow href="/links" icon={Library} label="Todos os links" meta={data?.links || undefined} />
          <CardRow href="/links/import" icon={FolderInput} label="Importar favoritos" />
        </CardList>
        {collections.length > 0 && (
          <CardSection label="Coleções fixadas">
            {collections.map((c) => (
              <Link key={c.id} href={`/links?c=${c.id}`} className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-body hover:bg-surface-2">
                <CollectionGlyph icon={c.icon} color={c.color} size={16} />
                <span className="truncate">{c.name}</span>
              </Link>
            ))}
          </CardSection>
        )}
        <CardFoot>
          <Link href="/links?add=1" className={footPrimary}>
            <Plus className="size-3.5" /> Salvar link
          </Link>
          <CardFootLink href="/links">Biblioteca</CardFootLink>
        </CardFoot>
      </RailCard>

      <RailCard {...card("tasks")} trigger={<RailLink href="/tasks" label="Tarefas" icon={ListTodo} on={NAV[3].match(pathname)} data-tour="nav-tasks" />}>
        <CardHead icon={ListTodo} title="Tarefas" text="Board por etapas, prazos e acompanhamentos." />
        <CardList>
          <CardRow href="/tasks?scope=today" icon={CalendarCheck} label="Meu dia" />
          <CardRow href="/tasks?scope=followup" icon={Eye} label="Acompanhar" />
          <CardRow href="/tasks?report=1" icon={FileBarChart2} label="Relatório de concluídas" />
        </CardList>
        <CardSection label="Projetos">
          {data ? (
            data.projects.length ? (
              <div className="scrollbar-thin flex max-h-48 flex-col overflow-y-auto">
                {data.projects.map((p) => (
                  <Link key={p.id} href={`/tasks?project=${encodeURIComponent(p.id)}`} className="flex h-8 shrink-0 items-center gap-2.5 rounded-lg px-2 text-body hover:bg-surface-2">
                    <span data-color={p.color} className="wp-task-color mx-1 size-2 shrink-0 rounded-full" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.open > 0 && (
                      <span className="px-1.5 text-caption font-medium tabular-nums text-muted" title="Tarefas abertas">
                        {p.open}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="px-2 py-1.5 text-body text-muted">Nenhum projeto ainda.</p>
            )
          ) : (
            <CardLoading />
          )}
        </CardSection>
        <CardFoot>
          <Link href="/tasks?new=1" className={footPrimary}>
            <Plus className="size-3.5" /> Nova tarefa
          </Link>
          <CardFootLink href="/tasks">Todas as tarefas</CardFootLink>
        </CardFoot>
      </RailCard>

      <RailCard {...card("tags")} trigger={<RailLink href="/tags" label="Tags" icon={Tag} on={NAV[4].match(pathname)} data-tour="nav-tags" />}>
        <CardHead icon={Tag} title="Tags" text="Temas compartilhados entre plans e links." />
        <CardSection label="Mais usadas">
          {data ? (
            data.tags.length ? (
              <div className="flex flex-wrap gap-1.5 px-2 pb-1 pt-0.5">
                {data.tags.map((t) => (
                  <Link
                    key={t.name}
                    href={`/tags/${encodeURIComponent(t.name)}`}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-caption font-medium text-ink-2 hover:border-line-2 hover:text-ink"
                  >
                    #{t.name} <span className="tabular-nums text-muted">{t.count}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="px-2 py-1.5 text-body text-muted">Nenhuma tag ainda.</p>
            )
          ) : (
            <CardLoading />
          )}
        </CardSection>
        <CardFoot>
          <CardFootLink href="/tags">Todas as tags</CardFootLink>
        </CardFoot>
      </RailCard>

      <RailCard
        {...card("search")}
        trigger={
          <RailButton label="Buscar" icon={Search} onClick={() => openPalette()} data-tour="nav-search" />
        }
      >
        <CardHead icon={Search} title="Buscar" text="Plans, blocos dentro dos plans, links, coleções e tags, num lugar só." kbd="⌘K" />
        <CardFoot>
          <button type="button" className={footPrimary} onClick={() => openPalette()}>
            <Search className="size-3.5" /> Abrir a busca
          </button>
        </CardFoot>
      </RailCard>

      <div className="flex-1" />

      <NotificationsButton scope={workspace.id} onOpen={() => setOpen(null)} />

      <HelpCard {...card("help")} pathname={pathname} />

      <SettingsCard {...card("settings")} on={pathname.startsWith("/settings")} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Sua conta" className="mt-1.5 flex size-10 items-center justify-center rounded-full hover:bg-hover">
            <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-body font-semibold text-accent-ink">{(user.name.trim()[0] ?? "?").toUpperCase()}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end">
          <DropdownMenuLabel className="normal-case tracking-normal">
            <span className="block text-body font-semibold text-ink">{user.name}</span>
            <span className="block text-xs font-normal text-muted">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.length > 1 && (
            <>
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              <WorkspaceItems current={workspace} workspaces={workspaces} />
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel>Tema</DropdownMenuLabel>
          <ThemeItems current={theme} />
          <DropdownMenuSeparator />
          <SignOutItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

// ------------------------------------------------------------------ rail pieces

const railItem =
  "group/rail relative flex h-[50px] w-[60px] shrink-0 flex-col items-center justify-center gap-[3px] rounded-xl text-muted outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40 data-[state=open]:bg-hover data-[state=open]:text-ink [&_svg]:size-[22px]";
const railOn = "bg-accent-soft text-accent-ink hover:bg-accent-soft hover:text-accent-ink data-[state=open]:bg-accent-soft data-[state=open]:text-accent-ink";
const railLabel = "max-w-full truncate px-0.5 text-[10.5px] font-medium leading-none tracking-[.01em]";

const RailLink = React.forwardRef<HTMLAnchorElement, { href: string; label: string; icon: LucideIcon; on?: boolean } & React.ComponentProps<"a">>(function RailLink(
  { href, label, icon: Icon, on, className, ...rest },
  ref,
) {
  return (
    <Link ref={ref} href={href} aria-current={on ? "page" : undefined} className={cn(railItem, on && railOn, className)} {...rest}>
      {on && <span className="absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" aria-hidden />}
      <Icon strokeWidth={on ? 2 : 1.75} />
      <span className={railLabel}>{label}</span>
    </Link>
  );
});

const RailButton = React.forwardRef<HTMLButtonElement, { label: string; icon: LucideIcon; ariaLabel?: string; badge?: React.ReactNode } & React.ComponentProps<"button">>(function RailButton(
  { label, icon: Icon, ariaLabel, badge, className, ...rest },
  ref,
) {
  return (
    <button ref={ref} type="button" aria-label={ariaLabel} className={cn(railItem, className)} {...rest}>
      <Icon strokeWidth={1.75} />
      <span className={railLabel}>{label}</span>
      {badge}
    </button>
  );
});

/** The bell: unread count on the icon, the notification center in a popover beside the rail. */
function NotificationsButton({ scope, onOpen }: { scope: string; onOpen: () => void }) {
  const { unread } = useNotifications(scope);
  const [open, setOpen] = React.useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) onOpen();
      }}
    >
      <PopoverTrigger asChild>
        <RailButton label="Avisos" icon={Bell} ariaLabel={unreadLabel(unread)} badge={<UnreadBadge count={unread} className="right-3 top-1.5" />} />
      </PopoverTrigger>
      <PopoverContent side="right" align="end" sideOffset={12} collisionPadding={12} className="flex max-h-[min(560px,calc(100dvh-24px))] w-[340px] flex-col overflow-hidden p-0">
        <NotificationsPanel scope={scope} onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** The card that opens beside a rail item on hover or focus. */
function RailCard({ open, onOpenChange, trigger, children }: { open: boolean; onOpenChange: (o: boolean) => void; trigger: React.ReactElement; children: React.ReactNode }) {
  return (
    <HoverCard.Root open={open} onOpenChange={onOpenChange} openDelay={120} closeDelay={140}>
      <HoverCard.Trigger asChild>{trigger}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="right"
          align="start"
          sideOffset={12}
          alignOffset={-6}
          collisionPadding={12}
          className="wp-float z-50 flex w-[288px] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-pop"
        >
          {children}
          <HoverCard.Arrow width={14} height={7} className="fill-[var(--surface)] [filter:drop-shadow(-1px_0_0_var(--line))]" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

function CardHead({ icon: Icon, title, text, kbd }: { icon: LucideIcon; title: string; text: string; kbd?: string }) {
  return (
    <div className="flex items-start gap-3 px-4 pb-3 pt-4">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink [&_svg]:size-[18px]">
        <Icon strokeWidth={1.9} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="text-lead font-semibold">{title}</span>
          {kbd && <Kbd>{kbd}</Kbd>}
        </span>
        <span className="text-caption leading-4 text-muted">{text}</span>
      </span>
    </div>
  );
}

function CardList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col px-2 pb-2">{children}</div>;
}

function CardSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col border-t border-line px-2 pb-2 pt-2.5">
      <span className="px-2 pb-1 text-micro font-semibold uppercase tracking-[.08em] text-muted">{label}</span>
      {children}
    </div>
  );
}

function CardRow({ href, onSelect, icon: Icon, label, meta, kbd, accent }: { href?: string; onSelect?: () => void; icon: LucideIcon; label: string; meta?: number; kbd?: string; accent?: boolean }) {
  const body = (
    <>
      <Icon className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {meta !== undefined && <span className={cn("rounded-full px-1.5 text-caption font-medium tabular-nums", accent ? "bg-accent text-white" : "text-muted")}>{meta}</span>}
      {kbd && <Kbd>{kbd}</Kbd>}
    </>
  );
  const cls = "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-body hover:bg-surface-2";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={onSelect}>
      {body}
    </button>
  );
}

function CardLoading() {
  return (
    <div className="flex h-10 items-center px-2">
      <Loader2 className="size-4 animate-spin text-muted" aria-label="Carregando" />
    </div>
  );
}

const footPrimary = "inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-body font-medium text-white transition-colors hover:bg-accent/90";

function CardFoot({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2/60 px-3 py-2.5">{children}</div>;
}

function CardFootLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="ml-auto inline-flex items-center gap-1 text-body font-medium text-accent-ink hover:underline">
      {children} <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

function NewPlanButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      type="button"
      className={footPrimary}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const id = await createPlanAction({ starter: "blank" });
          router.push(`/plans/${id}/edit`);
        } catch {
          toast.error("Não foi possível criar o plan.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Novo plan
    </button>
  );
}

function SettingsCard({ open, onOpenChange, on }: { open: boolean; onOpenChange: (o: boolean) => void; on: boolean }) {
  const desktop = useDesktop();
  return (
    <RailCard open={open} onOpenChange={onOpenChange} trigger={<RailLink href="/settings" label="Ajustes" icon={Settings} on={on} data-tour="nav-settings" />}>
      <CardHead icon={Settings} title="Configurações" text="Conta, aparência, workspace, integrações e backups." />
      <CardList>
        <CardRow href="/settings?tab=conta" icon={User} label="Conta" />
        <CardRow href="/settings?tab=aparencia" icon={Palette} label="Aparência" />
        <CardRow href="/settings?tab=workspace" icon={Users} label="Workspace e pessoas" />
        <CardRow href="/settings?tab=integracoes" icon={KeyRound} label="Integrações e tokens" />
        <CardRow href="/settings?tab=backup" icon={ShieldCheck} label="Backup e dados" />
        <CardRow href="/trash" icon={Trash2} label="Lixeira" />
        {desktop && <CardRow href="/settings?tab=aplicativo" icon={Monitor} label="Aplicativo e bloqueio" />}
      </CardList>
    </RailCard>
  );
}

/** Contextual help: the current module's tour and guide, the help center and the shortcuts. */
function HelpCard({ open, onOpenChange, pathname }: { open: boolean; onOpenChange: (o: boolean) => void; pathname: string }) {
  const current = helpModuleFor(pathname);
  return (
    <RailCard open={open} onOpenChange={onOpenChange} trigger={<RailLink href={current ? `/help/${current.id}` : "/help"} label="Ajuda" icon={CircleHelp} on={pathname.startsWith("/help")} data-tour="nav-help" />}>
      <CardHead icon={CircleHelp} title="Ajuda" text={current ? `Você está em ${current.title}. ${current.summary}` : "Guias e tours de cada módulo."} />
      <CardList>
        {current && current.tour.length > 0 && <CardRow onSelect={() => (onOpenChange(false), startTour(current.id))} icon={PlayCircle} label={`Tour: ${current.title}`} accent />}
        {current && <CardRow href={`/help/${current.id}`} icon={BookOpen} label={`Guia de ${current.title}`} />}
        <CardRow href="/help" icon={LifeBuoy} label="Central de ajuda" />
        <CardRow onSelect={() => (onOpenChange(false), openShortcuts())} icon={Keyboard} label="Atalhos de teclado" kbd="?" />
      </CardList>
    </RailCard>
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

/** Signs out on the web; in the desktop app (single local person, no login) it quits the app. */
function SignOutItem() {
  const desktop = useDesktop();
  return desktop ? (
    <DropdownMenuItem onSelect={() => desktop.run("quit")}>
      <LogOut /> Sair do aplicativo
    </DropdownMenuItem>
  ) : (
    <DropdownMenuItem onSelect={() => logoutAction()}>
      <LogOut /> Sair
    </DropdownMenuItem>
  );
}

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
  // The rail (mounted too, hidden on phones) refetches on workspace switches; the store is shared.
  const { unread } = useNotifications("phone");
  const [notesOpen, setNotesOpen] = React.useState(false);
  const tab = "group/tab flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-caption font-medium text-muted [&_svg]:size-[22px]";
  // Active tab: a pill behind the icon (not just a color change).
  const pill = "flex h-7 w-12 items-center justify-center rounded-full transition-colors group-aria-[current=page]/tab:bg-accent-soft";
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      {NAV.slice(0, 4).map(({ href, label, icon: Icon, match }) => {
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
            <span className={cn(pill, "relative")}>
              <Menu strokeWidth={1.75} />
              <UnreadBadge count={unread} className="-top-1 right-0.5" />
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
          <DropdownMenuItem onSelect={() => setNotesOpen(true)}>
            <Bell /> Notificações
            {unread > 0 && <span className="ml-auto rounded-full bg-accent px-1.5 text-caption font-medium tabular-nums text-white">{unread > 99 ? "99+" : unread}</span>}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/tags"><Tag /> Tags</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings"><Settings /> Configurações</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/help"><CircleHelp /> Ajuda</Link>
          </DropdownMenuItem>
          {helpModuleFor(pathname)?.tour.length ? (
            <DropdownMenuItem onSelect={() => startTour(helpModuleFor(pathname)!.id)}>
              <PlayCircle /> Tour desta página
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuLabel>Tema</DropdownMenuLabel>
          <ThemeItems current={theme} />
          <DropdownMenuSeparator />
          <SignOutItem />
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent title="Notificações" description="Lembretes, prazos, menções e links quebrados." className="max-h-[80dvh]">
          {notesOpen && <NotificationsPanel scope="phone" hideTitle onNavigate={() => setNotesOpen(false)} className="border-t border-line" />}
        </DialogContent>
      </Dialog>
    </nav>
  );
}
