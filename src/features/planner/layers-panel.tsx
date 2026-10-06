"use client";
import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  Focus,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  SquareMousePointer,
  SunDim,
  Trash2,
  Waves,
  X,
} from "lucide-react";
import { BASE_LAYER_ID, LAYER_COLORS } from "@/domain/layers";
import type { PlanLayer } from "@/domain/plan";
import { SectionLabel } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { ask } from "@/components/ui/ask";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";

const iconBtn =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 [&_svg]:size-3.5";

function LayerRow({ layer, index, total }: { layer: PlanLayer; index: number; total: number }) {
  const ed = useEditor();
  const L = ed.layers;
  const active = L.active === layer.id;
  const visible = layer.visible !== false;
  const count = L.counts.get(layer.id) ?? 0;
  const [renaming, setRenaming] = React.useState(false);
  const base = layer.id === BASE_LAYER_ID;
  const hasSelection = ed.selectedNodes.length > 0 || ed.selectedEdges.length > 0;

  return (
    <li
      className={cn(
        "group flex h-8 items-center gap-1.5 rounded-md pl-1.5 pr-1 text-body transition-colors",
        active ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2",
        !visible && "text-muted",
      )}
    >
      <DropdownMenu>
        <Tooltip content="Cor da camada" side="right">
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Cor de ${layer.name}`} className="flex size-5 shrink-0 items-center justify-center rounded">
              <span className="size-2.5 rounded-full ring-2 ring-surface" style={{ background: layer.color ?? "var(--muted)" }} />
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="start" className="min-w-0 p-2">
          <div className="grid grid-cols-4 gap-1.5">
            {LAYER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => L.update(layer.id, { color: c })}
                className="size-6 rounded-full border-2 border-surface"
                style={{ background: c, boxShadow: layer.color === c ? "0 0 0 2px var(--accent)" : "0 0 0 1px var(--line-2)" }}
              />
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {renaming ? (
        <input
          autoFocus
          defaultValue={layer.name}
          maxLength={80}
          aria-label="Nome da camada"
          className="h-6 min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 text-body text-ink outline-none"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== layer.name) L.update(layer.id, { name: v });
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setRenaming(false);
          }}
        />
      ) : (
        <button
          type="button"
          className={cn("flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none", !visible && "line-through decoration-muted/60")}
          onClick={() => L.setActive(layer.id)}
          onDoubleClick={() => setRenaming(true)}
          title={active ? "Camada ativa: novos elementos, conexões e desenhos entram aqui. Duplo clique para renomear." : "Clique para tornar ativa; duplo clique para renomear."}
          aria-pressed={active}
        >
          <span className="truncate">{layer.name}</span>
          {layer.animate && <Waves className="size-3 shrink-0 opacity-70" aria-label="Conexões animadas" />}
          {layer.dimmed && <SunDim className="size-3 shrink-0 opacity-70" aria-label="Esmaecida" />}
          <span className="ml-auto shrink-0 pr-0.5 text-caption tabular-nums text-muted">{count || ""}</span>
        </button>
      )}

      <Tooltip content={visible ? "Ocultar (⌥ clique: mostrar só esta)" : "Mostrar"} side="right">
        <button
          type="button"
          aria-label={visible ? `Ocultar ${layer.name}` : `Mostrar ${layer.name}`}
          aria-pressed={visible}
          className={iconBtn}
          onClick={(e) => (e.altKey ? L.solo(layer.id) : L.update(layer.id, { visible: !visible }))}
        >
          {visible ? <Eye /> : <EyeOff />}
        </button>
      </Tooltip>
      <Tooltip content={layer.locked ? "Destravar" : "Travar (não seleciona nem move)"} side="right">
        <button
          type="button"
          aria-label={layer.locked ? `Destravar ${layer.name}` : `Travar ${layer.name}`}
          aria-pressed={!!layer.locked}
          className={cn(iconBtn, !layer.locked && "hidden group-focus-within:inline-flex group-hover:inline-flex")}
          onClick={() => L.update(layer.id, { locked: !layer.locked })}
        >
          {layer.locked ? <Lock /> : <LockOpen />}
        </button>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Mais opções de ${layer.name}`} className={cn(iconBtn, "hidden group-focus-within:inline-flex group-hover:inline-flex data-[state=open]:inline-flex")}>
            <MoreHorizontal />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[230px]">
          <DropdownMenuItem onSelect={() => setTimeout(() => setRenaming(true), 50)}>
            <Pencil /> Renomear
          </DropdownMenuItem>
          {hasSelection && (
            <DropdownMenuItem onSelect={() => L.assignSelection(layer.id)}>
              <ArrowDown className="-rotate-90" /> Mover seleção para cá
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => L.selectLayer(layer.id)} disabled={!count || !visible || !!layer.locked}>
            <SquareMousePointer /> Selecionar elementos
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => L.solo(layer.id)}>
            <Focus /> Mostrar só esta {base ? "" : "(e a base)"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => L.update(layer.id, { dimmed: !layer.dimmed })}>
            <SunDim /> Esmaecer
            {layer.dimmed && <Check className="ml-auto" />}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => L.update(layer.id, { animate: !layer.animate })}>
            <Waves /> Animar conexões (mostrar fluxo)
            {layer.animate && <Check className="ml-auto" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => L.move(layer.id, "up")} disabled={index === total - 1}>
            <ArrowUp /> Subir
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => L.move(layer.id, "down")} disabled={index === 0}>
            <ArrowDown /> Descer
          </DropdownMenuItem>
          {!base && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-danger">
                  <Trash2 /> Excluir camada
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-[250px]">
                  <DropdownMenuItem onSelect={() => L.remove(layer.id, "merge")}>Manter os elementos na camada de baixo</DropdownMenuItem>
                  <DropdownMenuItem
                    danger
                    onSelect={async () => {
                      const ok = await ask.confirm({
                        title: `Excluir “${layer.name}” e o que há nela?`,
                        description: `${count} ${count === 1 ? "elemento ou conexão" : "elementos e conexões"} serão removidos. Dá para desfazer (⌘Z).`,
                        confirmLabel: "Excluir",
                        danger: true,
                      });
                      if (ok) L.remove(layer.id, "delete");
                    }}
                  >
                    Excluir junto com os elementos
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** Saved combinations of visible layers. */
function ViewsMenu() {
  const ed = useEditor();
  const L = ed.layers;
  const current = L.views.find((v) => {
    const on = new Set(v.layers);
    return L.list.every((l) => (l.visible !== false) === on.has(l.id));
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex h-6 max-w-[110px] items-center gap-1 rounded-md px-1.5 text-caption font-medium text-muted hover:bg-hover hover:text-ink" title="Visões salvas">
          <Eye className="size-3.5 shrink-0" />
          <span className="truncate">{current?.name ?? "Visões"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[230px]">
        <DropdownMenuLabel>Visões</DropdownMenuLabel>
        {L.views.length === 0 && <p className="px-2.5 pb-1.5 text-caption leading-4 text-muted">Salve a combinação de camadas visíveis (ex.: “Fluxo atual”, “Proposta v2”) para alternar com um clique, também na visualização.</p>}
        {L.views.map((v) => (
          <DropdownMenuItem key={v.id} onSelect={() => L.applyView(v.id)} className="group/view">
            {current?.id === v.id ? <Check /> : <span className="size-[15px]" />}
            <span className="truncate">{v.name}</span>
            <button
              type="button"
              aria-label={`Excluir visão ${v.name}`}
              className="ml-auto inline-flex size-5 items-center justify-center rounded opacity-0 hover:bg-hover group-hover/view:opacity-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                L.removeView(v.id);
              }}
            >
              <X className="!size-3" />
            </button>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            const name = await ask.prompt({ title: "Salvar visão", description: "Guarda quais camadas estão visíveis agora.", label: "Nome", placeholder: "Ex.: Fluxo atual", confirmLabel: "Salvar" });
            if (name?.trim()) L.saveView(name.trim());
          }}
        >
          <Save /> Salvar visão atual…
        </DropdownMenuItem>
        {L.list.some((l) => l.visible === false) && (
          <DropdownMenuItem onSelect={L.showAll}>
            <Eye /> Mostrar todas as camadas
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Layers of the plan, top layer first: pick the active one (where new things go), hide, lock,
 * fade, animate flows, reorder, and save views.
 */
export function LayersPanel() {
  const ed = useEditor();
  const L = ed.layers;
  const top = [...L.list].map((l, i) => ({ l, i })).reverse();
  return (
    <section className="flex flex-col gap-1.5" aria-label="Camadas">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Camadas</SectionLabel>
        <div className="flex items-center gap-0.5">
          <ViewsMenu />
          <Tooltip content="Nova camada" side="right">
            <button type="button" aria-label="Nova camada" className={iconBtn} onClick={L.add}>
              <Plus />
            </button>
          </Tooltip>
        </div>
      </div>
      <ul className="-mx-2 flex flex-col gap-px">
        {top.map(({ l, i }) => (
          <LayerRow key={l.id} layer={l} index={i} total={L.list.length} />
        ))}
      </ul>
      {L.list.length === 1 && (
        <p className="text-caption leading-4 text-muted">Crie camadas para desenhar fluxos alternativos, versões ou anotações por cima do plan, e mostre ou oculte cada uma.</p>
      )}
    </section>
  );
}
