"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutDashboard, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { saveHomeLayoutAction } from "@/app/(app)/dashboard-actions";
import { defaultHomeLayout, HOME_WIDGETS, type HomeLayout, type HomeWidget } from "@/domain/dashboard";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/misc";

/** Show, hide and reorder the home sections; saved per person and workspace. */
export function CustomizeDashboard({ layout: initial }: { layout: HomeLayout }) {
  const router = useRouter();
  const [layout, setLayout] = React.useState(initial);
  const [pending, start] = React.useTransition();
  React.useEffect(() => setLayout(initial), [initial]);
  const save = (next: HomeLayout) => {
    const before = layout;
    setLayout(next);
    start(async () => {
      const r = await saveHomeLayoutAction(next).catch(() => null);
      if (!r || !r.ok) {
        setLayout(before);
        toast.error(r && !r.ok ? r.error : "Não foi possível salvar.");
        return;
      }
      router.refresh();
    });
  };
  const move = (id: HomeWidget, dir: -1 | 1) => {
    const order = [...layout.order];
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    save({ ...layout, order });
  };
  const toggle = (id: HomeWidget) =>
    save({ ...layout, hidden: layout.hidden.includes(id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id] });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" data-tour="home-customize">
          <LayoutDashboard /> Personalizar
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] max-w-[calc(100vw-24px)] p-0">
        <div className="border-b border-line px-4 py-3">
          <p className="text-sm font-semibold">Seu painel</p>
          <p className="text-caption leading-4 text-muted">Escolha o que aparece no Início e em que ordem. Vale só para você.</p>
        </div>
        <ul className={cn("flex flex-col py-1", pending && "opacity-70")}>
          {layout.order.map((id, i) => {
            const w = HOME_WIDGETS.find((x) => x.id === id)!;
            const hidden = layout.hidden.includes(id);
            return (
              <li key={id} className="flex items-center gap-2 px-2 py-1">
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  aria-pressed={!hidden}
                  aria-label={`${hidden ? "Mostrar" : "Ocultar"} ${w.label}`}
                  className={cn("flex size-7 shrink-0 items-center justify-center rounded-md transition-colors", hidden ? "text-muted hover:bg-hover" : "bg-accent-soft text-accent-ink")}
                >
                  {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
                <span className={cn("flex min-w-0 flex-1 flex-col", hidden && "opacity-50")}>
                  <span className="truncate text-body font-medium">{w.label}</span>
                  <span className="truncate text-caption text-muted">{w.description}</span>
                </span>
                <button type="button" className="rounded p-1 text-muted hover:bg-hover hover:text-ink disabled:opacity-30" aria-label={`Subir ${w.label}`} disabled={i === 0} onClick={() => move(id, -1)}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted hover:bg-hover hover:text-ink disabled:opacity-30"
                  aria-label={`Descer ${w.label}`}
                  disabled={i === layout.order.length - 1}
                  onClick={() => move(id, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
          <span className="flex items-center gap-2 text-caption text-ink-2">
            Painéis por linha
            <Segmented<"2" | "3">
              size="sm"
              label="Painéis lado a lado"
              value={String(layout.columns) as "2" | "3"}
              onChange={(v) => save({ ...layout, columns: Number(v) as 2 | 3 })}
              options={[
                { value: "2", label: "2" },
                { value: "3", label: "3" },
              ]}
            />
          </span>
          <Button size="sm" variant="ghost" onClick={() => save(defaultHomeLayout())}>
            <RotateCcw /> Padrão
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
