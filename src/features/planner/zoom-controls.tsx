"use client";
import { useReactFlow, useStore } from "@xyflow/react";
import { Maximize, Minus, Plus } from "lucide-react";
import { Tooltip } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const pillBtn = "inline-flex size-[34px] items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-hover hover:text-ink [&_svg]:size-[18px]";

export function ZoomControls({ compact }: { compact?: boolean }) {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const size = compact ? "size-[30px]" : "size-[34px]";
  return (
    <>
      <Tooltip content="Diminuir zoom" side="top">
        <button type="button" aria-label="Diminuir zoom" className={cn(pillBtn, size)} onClick={() => rf.zoomOut({ duration: 150 })}>
          <Minus />
        </button>
      </Tooltip>
      <Tooltip content="Zoom 100%" side="top">
        <button type="button" aria-label={`Zoom atual ${Math.round(zoom * 100)}%. Redefinir para 100%`} className="w-11 rounded-md py-1 text-center font-mono text-xs text-ink-2 hover:bg-hover" onClick={() => rf.zoomTo(1, { duration: 150 })}>
          {Math.round(zoom * 100)}%
        </button>
      </Tooltip>
      <Tooltip content="Aumentar zoom" side="top">
        <button type="button" aria-label="Aumentar zoom" className={cn(pillBtn, size)} onClick={() => rf.zoomIn({ duration: 150 })}>
          <Plus />
        </button>
      </Tooltip>
      <Tooltip content="Ajustar à tela" side="top">
        <button type="button" aria-label="Ajustar à tela" className={cn(pillBtn, size)} onClick={() => rf.fitView({ padding: 0.15, duration: 250 })}>
          <Maximize />
        </button>
      </Tooltip>
    </>
  );
}

