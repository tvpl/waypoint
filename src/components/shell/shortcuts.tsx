"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { overlayOpen } from "@/lib/dom";

const OPEN_EVENT = "wp:open-shortcuts";

export function openShortcuts() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type Group = { title: string; scope?: RegExp; items: [string, string][] };

/** Keys are space-separated; each one renders as a key cap ("g l" = g, then l). */
const GROUPS: Group[] = [
  {
    title: "Em qualquer lugar",
    items: [
      ["Buscar e comandos", "⌘K"],
      ["Só comandos", "⌘K >"],
      ["Atalhos de teclado", "?"],
      ["Ir para Início", "g h"],
      ["Ir para Planner", "g p"],
      ["Ir para Links", "g l"],
      ["Ir para Tags", "g t"],
      ["Ir para Configurações", "g s"],
      ["Mostrar / ocultar a barra lateral", "["],
    ],
  },
  {
    title: "Início",
    scope: /^\/$/,
    items: [["Abrir item do acesso rápido", "1 … 9"]],
  },
  {
    title: "Links",
    scope: /^\/links/,
    items: [
      ["Filtrar (aceita tag: site: in: is: added:)", "/"],
      ["Novo link (ou cole uma URL na página)", "n"],
      ["Mover entre links", "j k"],
      ["Abrir o link em foco", "↵"],
      ["Abrir em nova aba", "o"],
      ["Selecionar", "x"],
      ["Estrela", "s"],
      ["Fixar no acesso rápido", "p"],
      ["Editar", "e"],
      ["Arquivar", "#"],
      ["Limpar seleção", "esc"],
      ["Navegar nas coleções (barra lateral)", "↑ ↓ ← →"],
    ],
  },
  {
    title: "Planner",
    scope: /^\/plans\/[^/]+/,
    items: [
      ["Selecionar · mover canvas · conectar", "v h c"],
      ["Retângulo · losango · elipse", "R D O"],
      ["Seta · linha · texto · quadro", "A L T F"],
      ["Ferramentas pela ordem da barra", "1 … 0"],
      ["Desenho: manter proporção", "⇧ ao arrastar"],
      ["Duplicar", "⌘D"],
      ["Copiar · colar", "⌘C ⌘V"],
      ["Agrupar · desagrupar", "⌘G ⇧⌘G"],
      ["Organizar vertical · horizontal", "⇧L ⌥⇧L"],
      ["Desenhar · borracha", "P E"],
      ["Mover seleção para a camada de baixo · de cima", "⌥[ ⌥]"],
      ["Desfazer · refazer", "⌘Z ⇧⌘Z"],
      ["Zoom: aproximar · afastar · 100% · ajustar", "+ - ⇧0 ⇧1"],
      ["Editar título", "↵"],
      ["Apresentar: avançar · voltar · sair", "→ ← esc"],
    ],
  },
];

const GO: Record<string, string> = { h: "/", p: "/plans", l: "/links", t: "/tags", s: "/settings" };

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};

/** "?" opens the cheat sheet; "g" then a letter jumps to a section. Mount once per layout. */
export function Shortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const pendingG = React.useRef<number | null>(null);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (overlayOpen() && !open) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (pendingG.current != null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const href = GO[e.key.toLowerCase()];
        if (href) {
          // Second key of a chord: screens must not also act on it (e.g. "p" pins a link).
          e.preventDefault();
          e.stopImmediatePropagation();
          router.push(href);
        }
        return;
      }
      if (e.key === "g") pendingG.current = window.setTimeout(() => (pendingG.current = null), 900);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    // Capture phase: runs before the screens' own window listeners.
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [router, open]);

  // The groups for the current screen come first.
  const groups = [...GROUPS].sort((a, b) => Number(!!b.scope?.test(pathname)) - Number(!!a.scope?.test(pathname)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Atalhos de teclado" description="Pressione ? a qualquer momento para ver esta lista." className="max-w-[760px]">
        <DialogBody className="grid gap-x-8 gap-y-6 pb-6 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title} className={cn("flex flex-col gap-2", g.scope?.test(pathname) && "sm:col-span-2")}>
              <h3 className="flex items-center gap-2 text-caption font-semibold uppercase tracking-[.06em] text-muted">
                {g.title}
                {g.scope?.test(pathname) && <span className="rounded-full bg-accent-soft px-1.5 py-px text-micro normal-case tracking-normal text-accent-ink">nesta tela</span>}
              </h3>
              <ul className={cn("grid gap-x-8 gap-y-1.5", g.scope?.test(pathname) && "sm:grid-cols-2")}>
                {g.items.map(([label, keys]) => (
                  <li key={label} className="flex items-center justify-between gap-3 text-body text-ink-2">
                    <span>{label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {keys.split(" ").map((k, i) => (k === "…" ? <span key={i} className="text-muted">…</span> : <Kbd key={i}>{k}</Kbd>))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
