"use client";
import { ArrowLeftRight, Grid3x3, Group, Hand, Magnet, MousePointer2, Network, Trash2, Workflow, X } from "lucide-react";
import { EDGE_KINDS } from "@/domain/plan";
import { EDGE_APPEARANCE } from "@/domain/canvas-adapter";
import { Tooltip } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { ConnectorIcon } from "./icons";
import { EdgeSample } from "./edges";
import { ALIGN_ACTIONS, DISTRIBUTE_ACTIONS } from "./inspector";
import { ZoomControls, pillBtn } from "./zoom-controls";

const pillOn = "bg-accent-soft text-accent-ink hover:bg-accent-soft hover:text-accent-ink";

function Sep() {
  return <span className="mx-1 h-5 w-px bg-line" aria-hidden />;
}

export function BottomPill() {
  const ed = useEditor();
  const tools = [
    { id: "select", label: "Selecionar (V)", icon: MousePointer2 },
    { id: "hand", label: "Mover canvas (H)", icon: Hand },
    { id: "connect", label: "Conectar (C)", icon: ConnectorIcon },
  ] as const;
  return (
    <div
      role="toolbar"
      aria-label="Ferramentas do canvas"
      className="wp-no-print absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-[0_8px_24px_-12px_rgba(23,23,28,.25)]"
    >
      {tools.map((t) => (
        <Tooltip key={t.id} content={t.label} side="top">
          <button type="button" aria-label={t.label} aria-pressed={ed.tool === t.id} className={cn(pillBtn, ed.tool === t.id && pillOn)} onClick={() => ed.setTool(t.id)}>
            <t.icon strokeWidth={1.75} />
          </button>
        </Tooltip>
      ))}
      <Sep />
      <Tooltip content={ed.grid ? "Ocultar grade" : "Mostrar grade"} side="top">
        <button type="button" aria-label="Grade" aria-pressed={ed.grid} className={cn(pillBtn, ed.grid && "text-accent-ink")} onClick={() => ed.setGrid(!ed.grid)}>
          <Grid3x3 strokeWidth={1.75} />
        </button>
      </Tooltip>
      <Tooltip content={ed.snap ? "Desativar encaixe na grade" : "Encaixar na grade"} side="top">
        <button type="button" aria-label="Encaixar na grade" aria-pressed={ed.snap} className={cn(pillBtn, ed.snap && "text-accent-ink")} onClick={() => ed.setSnap(!ed.snap)}>
          <Magnet strokeWidth={1.75} />
        </button>
      </Tooltip>
      <Sep />
      <ArrangeMenu />
      <Sep />
      <ZoomControls />
    </div>
  );
}

/** "Organizar automaticamente" — vertical / horizontal flow (selection or whole plan). */
export function ArrangeMenu() {
  const ed = useEditor();
  const n = ed.selectedNodes.length;
  return (
    <DropdownMenu>
      <Tooltip content="Organizar automaticamente" side="top">
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Organizar automaticamente" className={pillBtn}>
            <Workflow strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent side="top" align="center" sideOffset={10} className="min-w-[248px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel>{n > 0 ? `Organizar seleção (${n})` : "Organizar o plan"}</DropdownMenuLabel>
        <ArrangeItems Item={DropdownMenuItem} onPick={(d) => ed.autoArrange(d)} />
        <p className="px-2.5 pb-1.5 pt-1 text-[11px] leading-4 text-muted">
          {n > 0 ? "Só os elementos selecionados (e o interior de containers selecionados) são reorganizados." : "Segue as conexões; notas e itens soltos vão para o fim. Dá para desfazer."}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ItemComp = React.ComponentType<{ onSelect?: (e: Event) => void; shortcut?: string; children?: React.ReactNode }>;

export function ArrangeItems({ Item, onPick }: { Item: ItemComp; onPick: (d: "TB" | "LR") => void }) {
  return (
    <>
      <Item onSelect={() => onPick("TB")} shortcut="⇧L">
        <Network /> Vertical
      </Item>
      <Item onSelect={() => onPick("LR")} shortcut="⌥⇧L">
        <Network className="-rotate-90" /> Horizontal
      </Item>
    </>
  );
}

const barCls =
  "wp-no-print absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-line bg-surface p-1 text-[13px] shadow-[0_8px_24px_-12px_rgba(23,23,28,.25)] animate-in";
const barBtn = "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-1.5 text-ink-2 hover:bg-hover hover:text-ink [&_svg]:size-4";

/** Contextual floating toolbar: connect mode, multi-selection layout, or edge kind. */
export function SelectionBar() {
  const ed = useEditor();
  if (ed.tool === "connect") {
    return (
      <div className={barCls} role="toolbar" aria-label="Conexão">
        <span className="px-2 text-ink-2">Clique na origem e depois no destino</span>
        <Sep />
        <KindPicker value={ed.connectKind} onChange={ed.setConnectKind} />
        <Sep />
        <button type="button" className={barBtn} onClick={() => ed.setTool("select")} aria-label="Sair do modo conexão">
          <X /> <span className="pr-1">Concluir</span>
        </button>
      </div>
    );
  }
  if (ed.selectedNodes.length >= 2) {
    return (
      <div className={barCls} role="toolbar" aria-label="Organizar seleção">
        {ALIGN_ACTIONS.map((a) => (
          <Tooltip key={a.mode} content={a.label}>
            <button type="button" aria-label={a.label} className={barBtn} onClick={() => ed.align(a.mode)}>
              <a.icon />
            </button>
          </Tooltip>
        ))}
        <Sep />
        {DISTRIBUTE_ACTIONS.map((a) => (
          <Tooltip key={a.axis} content={ed.selectedNodes.length < 3 ? "Selecione 3 ou mais" : a.label}>
            <button type="button" aria-label={a.label} disabled={ed.selectedNodes.length < 3} className={cn(barBtn, "disabled:opacity-40")} onClick={() => ed.distribute(a.axis)}>
              <a.icon />
            </button>
          </Tooltip>
        ))}
        <Sep />
        <Tooltip content="Agrupar (⌘G)">
          <button type="button" className={barBtn} onClick={ed.group} aria-label="Agrupar">
            <Group /> <span className="pr-1">Agrupar</span>
          </button>
        </Tooltip>
      </div>
    );
  }
  if (ed.selectedNodes.length === 0 && ed.selectedEdges.length === 1) {
    const e = ed.selectedEdges[0];
    return (
      <div className={barCls} role="toolbar" aria-label="Conexão selecionada">
        <KindPicker value={e.data?.kind ?? "flow"} onChange={(kind) => ed.updateEdge(e.id, { kind })} />
        <Sep />
        <Tooltip content="Inverter direção">
          <button type="button" className={barBtn} aria-label="Inverter direção" onClick={() => ed.swapEdge(e.id)}>
            <ArrowLeftRight />
          </button>
        </Tooltip>
        <Tooltip content="Excluir conexão">
          <button type="button" className={cn(barBtn, "hover:text-danger")} aria-label="Excluir conexão" onClick={ed.remove}>
            <Trash2 />
          </button>
        </Tooltip>
      </div>
    );
  }
  return null;
}

function KindPicker({ value, onChange }: { value: (typeof EDGE_KINDS)[number]; onChange: (k: (typeof EDGE_KINDS)[number]) => void }) {
  return (
    <div role="radiogroup" aria-label="Tipo de conexão" className="flex items-center gap-0.5">
      {EDGE_KINDS.map((k) => (
        <Tooltip key={k} content={EDGE_APPEARANCE[k].label}>
          <button type="button" role="radio" aria-checked={value === k} aria-label={EDGE_APPEARANCE[k].label} onClick={() => onChange(k)} className={cn(barBtn, "px-2", value === k && pillOn)}>
            <EdgeSample kind={k} width={26} />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
