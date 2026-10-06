"use client";
import { ContextMenu as CM } from "radix-ui";
import { ArrowLeftRight, BringToFront, Check, ClipboardPaste, Copy, CopyPlus, Group, Layers, Link2, ListOrdered, ListX, MessageSquarePlus, Pencil, SendToBack, SquareMousePointer, Trash2, Ungroup, Workflow } from "lucide-react";
import { BASE_LAYER_ID } from "@/domain/layers";
import { EDGE_KINDS, NODE_KINDS, type NodeKind } from "@/domain/plan";
import { EDGE_APPEARANCE } from "@/domain/canvas-adapter";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/menu";
import { ArrangeItems } from "./canvas-controls";
import { useEditor } from "./editor-context";
import { KIND_LABEL, PARENT_KINDS } from "./defaults";
import { ConnectorIcon, KIND_ICON } from "./icons";
import { EdgeSample } from "./edges";

export type MenuTarget = { type: "node"; id: string } | { type: "edge"; id: string } | { type: "pane"; at: { x: number; y: number } } | null;

const label = "px-2.5 pb-1 pt-1.5 text-caption font-semibold uppercase tracking-[.06em] text-muted";

export function CanvasContextMenu({ target, children }: { target: MenuTarget; children: React.ReactNode }) {
  const ed = useEditor();
  const node = target?.type === "node" ? ed.nodes.find((n) => n.id === target.id) : undefined;
  const edge = target?.type === "edge" ? ed.edges.find((e) => e.id === target.id) : undefined;
  const multi = ed.selectedNodes.length > 1;
  const canUngroup = ed.selectedNodes.some((n) => PARENT_KINDS.has(n.type as NodeKind));
  const canArrangeSel = multi || canUngroup;
  // "Mover para camada" (nodes with what is inside them, and selected connections)
  const current = new Set([...ed.selectedNodes.map((n) => n.data._layer ?? BASE_LAYER_ID), ...ed.selectedEdges.map((e) => e.data?.layer ?? BASE_LAYER_ID)]);
  const toLayer =
    ed.layers.list.length > 1 ? (
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Layers /> Mover para camada
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="min-w-[200px]">
          {[...ed.layers.list].reverse().map((l) => (
            <ContextMenuItem key={l.id} onSelect={() => ed.layers.assignSelection(l.id)}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.color ?? "var(--muted)" }} aria-hidden />
              {l.name}
              {current.size === 1 && current.has(l.id) && <Check className="ml-auto" />}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
    ) : null;
  const arrange = (title: string, all = false) => (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Workflow /> {title}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-[200px]">
        <ArrangeItems Item={ContextMenuItem} onPick={(d) => ed.autoArrange(d, { all })} />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="wp-no-print">
        {node && (
          <>
            {!multi && (
              <ContextMenuItem onSelect={() => ed.startEditing(node.id)} shortcut="↵">
                <Pencil /> Editar
              </ContextMenuItem>
            )}
            <ContextMenuItem onSelect={ed.duplicate} shortcut="⌘D">
              <CopyPlus /> Duplicar
            </ContextMenuItem>
            <ContextMenuItem onSelect={ed.copy} shortcut="⌘C">
              <Copy /> Copiar
            </ContextMenuItem>
            {!multi && (
              <ContextMenuItem onSelect={() => ed.startConnectFrom(node.id)} shortcut="C">
                <ConnectorIcon /> Criar conexão
              </ContextMenuItem>
            )}
            {!multi && (
              <ContextMenuItem
                onSelect={() => {
                  ed.select([node.id]);
                  ed.setInspectorTab("action");
                }}
                shortcut="⌘L"
              >
                <Link2 /> Adicionar link
              </ContextMenuItem>
            )}
            {!multi && (
              <ContextMenuItem onSelect={() => ed.openComments(node.id)}>
                <MessageSquarePlus /> Comentar
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={ed.bringToFront} shortcut="]">
              <BringToFront /> Trazer para frente
            </ContextMenuItem>
            <ContextMenuItem onSelect={ed.sendToBack} shortcut="[">
              <SendToBack /> Enviar para trás
            </ContextMenuItem>
            <ContextMenuItem onSelect={ed.group} shortcut="⌘G">
              <Group /> Agrupar
            </ContextMenuItem>
            {canUngroup && (
              <ContextMenuItem onSelect={ed.ungroup} shortcut="⇧⌘G">
                <Ungroup /> Desagrupar
              </ContextMenuItem>
            )}
            {canArrangeSel && arrange(multi ? "Organizar seleção" : "Organizar interior")}
            {toLayer}
            <ContextMenuSeparator />
            <ContextMenuItem danger onSelect={ed.remove} shortcut="⌫">
              <Trash2 /> Excluir
            </ContextMenuItem>
          </>
        )}
        {edge && (
          <>
            <CM.Label className={label}>Tipo de conexão</CM.Label>
            {EDGE_KINDS.map((k) => (
              <ContextMenuItem key={k} onSelect={() => ed.updateEdge(edge.id, { kind: k })}>
                <EdgeSample kind={k} width={24} /> {EDGE_APPEARANCE[k].label}
                {edge.data?.kind === k && <Check className="ml-auto" />}
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => ed.swapEdge(edge.id)}>
              <ArrowLeftRight /> Inverter direção
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => ed.numberSteps(ed.selectedEdges.length > 1 ? undefined : [edge.id])}>
              <ListOrdered /> Numerar passos do fluxo
            </ContextMenuItem>
            {edge.data?.step !== undefined && (
              <ContextMenuItem onSelect={() => ed.clearSteps(ed.selectedEdges.length > 1 ? undefined : [edge.id])}>
                <ListX /> Remover numeração
              </ContextMenuItem>
            )}
            {toLayer}
            <ContextMenuItem danger onSelect={ed.remove} shortcut="⌫">
              <Trash2 /> Excluir conexão
            </ContextMenuItem>
          </>
        )}
        {target?.type === "pane" && (
          <>
            <CM.Label className={label}>Adicionar aqui</CM.Label>
            {NODE_KINDS.filter((k) => k !== "ink").map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <ContextMenuItem key={k} onSelect={() => ed.addNode(k, { at: target.at })}>
                  <Icon /> {KIND_LABEL[k]}
                </ContextMenuItem>
              );
            })}
            <ContextMenuSeparator />
            <ContextMenuItem disabled={!ed.hasClipboard()} onSelect={() => ed.paste(target.at)} shortcut="⌘V">
              <ClipboardPaste /> Colar aqui
            </ContextMenuItem>
            <ContextMenuItem onSelect={ed.selectAll} shortcut="⌘A">
              <SquareMousePointer /> Selecionar tudo
            </ContextMenuItem>
            {ed.nodes.length > 1 && arrange("Organizar automaticamente", true)}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
