"use client";
import { Columns3, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SummaryMode } from "./types";
import {
  COLUMN_LABEL,
  GROUP_LABEL,
  type DisplaySettings,
  type GroupMode,
  type LinkColumn,
} from "./display";

export function LibraryDisplayOptions({
  settings,
  onChange,
  summary,
  onSummary,
}: {
  settings: DisplaySettings;
  onChange: (patch: Partial<DisplaySettings>) => void;
  summary: SummaryMode;
  onSummary: (value: SummaryMode) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button data-tour="links-display" size="sm" variant="secondary">
          <SlidersHorizontal />
          Visualização
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="link-group">Agrupar por</Label>
          <select
            id="link-group"
            className="h-9 rounded-control border border-line-2 bg-surface px-2 text-body"
            value={settings.group}
            onChange={(e) => onChange({ group: e.target.value as GroupMode })}
          >
            {Object.entries(GROUP_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <p className="text-caption text-muted">
            Agrupa os links carregados. Cada link aparece uma vez; no modo de
            tags, usamos a primeira tag.
          </p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-body font-medium">Densidade</legend>
          <div className="flex gap-4">
            {(
              [
                ["comfortable", "Confortável"],
                ["dense", "Densa"],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="flex items-center gap-2 text-body">
                <input
                  type="radio"
                  name="link-density"
                  checked={settings.density === v}
                  onChange={() => onChange({ density: v })}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="link-summary">Descrição dos links</Label>
          <select
            id="link-summary"
            value={summary}
            onChange={(e) => onSummary(e.target.value as SummaryMode)}
            className="h-9 rounded-control border border-line-2 bg-surface px-2 text-body"
          >
            {[
              ["default", "Preferência de cada link"],
              ["always", "Sempre mostrar"],
              ["hover", "Ao passar o mouse"],
              ["hidden", "Ocultar"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-body">
          <input
            type="checkbox"
            checked={settings.covers}
            onChange={(e) => onChange({ covers: e.target.checked })}
          />
          Mostrar capas nos cards
        </label>
        <fieldset className="flex flex-col gap-2 border-t border-line pt-3">
          <legend className="flex items-center gap-1.5 text-body font-medium">
            <Columns3 className="size-4" />
            Colunas da lista
          </legend>
          {Object.entries(COLUMN_LABEL).map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-body">
              <input
                type="checkbox"
                checked={settings.columns.includes(v as LinkColumn)}
                onChange={(e) =>
                  onChange({
                    columns: e.target.checked
                      ? [...settings.columns, v as LinkColumn]
                      : settings.columns.filter((c) => c !== v),
                  })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="text-caption text-muted">
          Preferências salvas para você nesta coleção. Arraste a borda de uma
          coluna para ajustar sua largura.
        </p>
      </PopoverContent>
    </Popover>
  );
}
