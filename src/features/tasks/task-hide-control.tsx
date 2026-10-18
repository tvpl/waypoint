"use client";
import { EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { STATUS_LABELS, TASK_STATUSES } from "@/domain/tasks";
import { activeHideRules, HIDE_PRESETS, HIDE_RULE_LABELS, HIDE_RULES, noHideRules, type HideRule, type HideRules } from "@/domain/task-visibility";
import { cn } from "@/lib/utils";

const SHORT: Record<HideRule, string> = {
  show: "Mostrar",
  "before-today": "Dias ant.",
  "before-week": "Semanas ant.",
  "before-month": "Meses ant.",
  all: "Todas",
};

/** Per-folder (project) rules to hide stages entirely or only their older items. */
export function TaskHideControl({
  rules,
  onChange,
  scopeLabel,
  hiddenCount,
  open,
  onOpenChange,
}: {
  rules: HideRules;
  onChange: (rules: HideRules) => void;
  scopeLabel: string;
  hiddenCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const active = activeHideRules(rules).length;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant={active ? "soft" : "ghost"} size="sm" data-tour="tasks-hide" aria-label="Ocultar itens">
          <EyeOff />
          <span className="hidden sm:inline">Ocultar</span>
          {active > 0 && <span className="text-[11px] tabular-nums">{hiddenCount}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[400px] max-w-[calc(100vw-24px)] space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Ocultar itens</p>
          <p className="text-xs leading-5 text-muted">
            Vale para <b className="font-medium text-ink-2">{scopeLabel}</b> e fica salvo neste dispositivo. Concluídas contam pela data de conclusão; as demais, pela
            data de criação.
          </p>
        </div>
        <div className="space-y-3">
          {TASK_STATUSES.map((status) => (
            <div key={status} className="space-y-1.5">
              <span className="flex items-center gap-2 text-xs font-medium text-ink-2">
                <span className={cn("size-2 rounded-full", `wp-task-status-${status}`)} />
                {STATUS_LABELS[status]}
                {rules[status] !== "show" && <span className="font-normal text-accent-ink">· ocultando {HIDE_RULE_LABELS[rules[status]].toLowerCase()}</span>}
              </span>
              <div role="radiogroup" aria-label={`Ocultar ${STATUS_LABELS[status]}`} className="flex gap-0.5 rounded-lg bg-subtle p-[3px]">
                {HIDE_RULES.map((rule) => (
                  <button
                    key={rule}
                    type="button"
                    role="radio"
                    aria-checked={rules[status] === rule}
                    aria-label={`${STATUS_LABELS[status]}: ${rule === "show" ? "mostrar" : `ocultar ${HIDE_RULE_LABELS[rule].toLowerCase()}`}`}
                    title={rule === "show" ? "Mostrar todas" : `Ocultar ${HIDE_RULE_LABELS[rule].toLowerCase()}`}
                    onClick={() => onChange({ ...rules, [status]: rule })}
                    className={cn(
                      "h-6 flex-1 whitespace-nowrap rounded-md px-1 text-[11px] font-medium transition-colors",
                      rules[status] === rule ? (rule === "show" ? "bg-surface text-ink shadow-thumb" : "bg-surface text-accent-ink shadow-thumb") : "text-muted hover:text-ink",
                    )}
                  >
                    {SHORT[rule]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Atalhos</p>
          <div className="flex flex-wrap gap-1.5">
            {HIDE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => onChange({ ...noHideRules(), ...preset.rules })}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent-ink"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted" role="status">
            {active ? `${hiddenCount} ${hiddenCount === 1 ? "tarefa oculta" : "tarefas ocultas"}` : "Nada oculto"}
          </span>
          <Button size="sm" variant="ghost" disabled={!active} onClick={() => onChange(noHideRules())}>
            <RotateCcw /> Mostrar tudo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
