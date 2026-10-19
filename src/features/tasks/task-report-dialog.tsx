"use client";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ClipboardCopy, Code2, Download, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { taskReportAction } from "@/app/(app)/tasks/actions";
import { periodRange, REPORT_PERIODS, type ReportInput, type ReportPeriod } from "@/domain/task-report";
import { localDate, type TaskProject } from "@/domain/tasks";
import { cn } from "@/lib/utils";

const OPTIONS = [
  ["context", "Contexto"],
  ["subtasks", "Subtarefas"],
  ["notes", "Observações"],
  ["history", "Histórico"],
  ["timeline", "Linha do tempo"],
  ["includeArchived", "Incluir arquivadas"],
  ["includeOpen", "Seção Em andamento"],
] as const;
type OptionKey = (typeof OPTIONS)[number][0];

const PERIOD_SLUG: Record<ReportPeriod, string> = {
  "this-week": "esta-semana",
  "last-week": "semana-passada",
  "this-month": "este-mes",
  "last-month": "mes-passado",
  "last-30": "ultimos-30-dias",
  "this-year": "este-ano",
  all: "todo-o-historico",
  custom: "personalizado",
};
const rangeLabel = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="rounded bg-subtle px-1 font-mono text-xs">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Renders the report's own Markdown subset (headings, nested lists, checklists, quotes, rules). */
function ReportPreview({ markdown }: { markdown: string }) {
  return (
    <article className="space-y-1 text-[13px] leading-6 text-ink-2">
      {markdown.split("\n").map((line, i) => {
        if (line.startsWith("# ")) return <h2 key={i} className="pb-1 text-title font-semibold tracking-tight text-ink">{inline(line.slice(2))}</h2>;
        if (line.startsWith("## ")) return <h3 key={i} className="mt-5 border-b border-line pb-1.5 text-lead font-semibold text-ink">{inline(line.slice(3))}</h3>;
        if (line.startsWith("### ")) return <h4 key={i} className="mt-3 text-body font-semibold text-ink">{inline(line.slice(4))}</h4>;
        if (line === "---") return <hr key={i} className="my-4 border-line" />;
        const quote = /^(\s*)> ?(.*)$/.exec(line);
        if (quote) return <blockquote key={i} className="border-l-2 border-accent-line pl-3 text-muted">{inline(quote[2]) }</blockquote>;
        const item = /^(\s*)- (?:\[([ x])\] )?(.*)$/.exec(line);
        if (item)
          return (
            <div key={i} className="flex gap-2" style={{ paddingLeft: item[1].length * 8 + 4 }}>
              {item[2] !== undefined ? (
                <span className={cn("mt-1.5 flex size-3.5 shrink-0 items-center justify-center rounded border", item[2] === "x" ? "border-transparent bg-success-bg text-success-ink" : "border-line-2")}>
                  {item[2] === "x" && <Check className="size-2.5" />}
                </span>
              ) : (
                <span className="text-muted">•</span>
              )}
              <span className="min-w-0 break-words">{inline(item[3])}</span>
            </div>
          );
        return line.trim() ? (
          <p key={i} className="whitespace-pre-wrap" style={{ paddingLeft: (/^\s*/.exec(line)?.[0].length ?? 0) * 8 }}>
            {inline(line.trim())}
          </p>
        ) : (
          <div key={i} className="h-1.5" />
        );
      })}
    </article>
  );
}

/** "Relatório de concluídas": everything completed in a period, as Markdown to copy or download. */
export function TaskReportDialog({
  projects,
  projectId,
  workspaceName,
  initialPeriod,
  onClose,
}: {
  projects: TaskProject[];
  projectId: string;
  workspaceName: string;
  initialPeriod?: ReportPeriod;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod ?? "this-month");
  const today = localDate();
  const [custom, setCustom] = useState({ from: `${today.slice(0, 8)}01`, to: today });
  const [selected, setSelected] = useState<string[] | null>(projectId ? [projectId] : null);
  const [options, setOptions] = useState<Record<OptionKey, boolean>>({
    context: true,
    subtasks: true,
    notes: true,
    history: true,
    timeline: true,
    includeArchived: true,
    includeOpen: false,
  });
  const [mode, setMode] = useState<"preview" | "markdown">("preview");
  const [report, setReport] = useState<{ markdown: string; completed: number; open: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);

  const input = useMemo<ReportInput>(() => {
    const range = periodRange(period, new Date(), custom);
    const label =
      period === "custom"
        ? `${range.from ? rangeLabel.format(range.from) : "início"} – ${range.to ? rangeLabel.format(range.to - 1) : "hoje"}`
        : period === "all"
          ? "Todo o histórico"
          : `${REPORT_PERIODS.find((p) => p.id === period)!.label} (${rangeLabel.format(range.from!)} – ${rangeLabel.format(range.to! - 1)})`;
    return {
      ...range,
      periodLabel: label,
      projectIds: selected,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      ...options,
    };
  }, [period, custom, selected, options]);

  useEffect(() => {
    const id = ++request.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await taskReportAction(input);
        if (id !== request.current) return;
        if (r.ok) setReport(r.data);
        else toast.error(r.error);
      } catch {
        if (id === request.current) toast.error("Não foi possível gerar o relatório. Tente novamente.");
      } finally {
        if (id === request.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [input]);

  const fileName = `relatorio-${workspaceName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "waypoint"}-${period === "custom" ? `${custom.from}_a_${custom.to}` : PERIOD_SLUG[period]}.md`;
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([report.markdown], { type: "text/markdown;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Relatório baixado.");
  };
  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.markdown);
      toast.success("Relatório copiado.");
    } catch {
      toast.error("Não foi possível copiar. Use Baixar .md.");
    }
  };
  const toggleProject = (id: string) =>
    setSelected((current) => {
      const all = [...projects.map((p) => p.id), "none"];
      const base = current ?? all;
      const next = base.includes(id) ? base.filter((v) => v !== id) : [...base, id];
      return next.length === all.length ? null : next;
    });
  const chip = (on: boolean) =>
    cn(
      "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
      on ? "border-accent-line bg-accent-soft font-medium text-accent-ink" : "border-line bg-surface text-ink-2 hover:bg-hover",
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Relatório de concluídas"
        description="Tudo o que foi entregue no período: projetos, datas, observações e histórico — em Markdown."
        className="max-w-[1040px]"
      >
        <DialogBody className="gap-5 lg:grid lg:grid-cols-[300px_1fr] lg:items-start">
          <div className="flex flex-col gap-5">
            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs font-medium text-ink-2">Período</legend>
              <div className="flex flex-wrap gap-1.5">
                {REPORT_PERIODS.map((p) => (
                  <button key={p.id} type="button" className={chip(period === p.id)} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
              {period === "custom" && (
                <div className="grid grid-cols-2 gap-2 pt-1 animate-in">
                  <label className="space-y-1 text-[11px] text-muted">
                    De
                    <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
                  </label>
                  <label className="space-y-1 text-[11px] text-muted">
                    Até
                    <Input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
                  </label>
                </div>
              )}
            </fieldset>
            <fieldset>
              <legend className="mb-2 flex w-full items-center justify-between text-xs font-medium text-ink-2">
                Projetos
                <button type="button" className="text-[11px] font-normal text-accent-ink hover:underline" onClick={() => setSelected(null)}>
                  Todos
                </button>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {[...projects, { id: "none", name: "Sem projeto", color: "neutral" as const }].map((p) => {
                  const on = !selected || selected.includes(p.id);
                  return (
                    <button key={p.id} type="button" className={chip(on)} aria-pressed={on} onClick={() => toggleProject(p.id)}>
                      <span data-color={p.color} className="wp-task-color size-1.5 rounded-full" />
                      <span className="max-w-36 truncate">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-ink-2">Incluir</legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {OPTIONS.map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
                    <input type="checkbox" className="size-3.5 accent-accent" checked={options[key]} onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted" role="status">
                {loading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3 animate-spin" /> Gerando…
                  </span>
                ) : report ? (
                  `${report.completed} ${report.completed === 1 ? "tarefa concluída" : "tarefas concluídas"}${report.open ? ` · ${report.open} em andamento` : ""}`
                ) : null}
              </span>
              <Segmented
                className="ml-auto"
                size="sm"
                label="Formato"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "preview", label: "Prévia", icon: <Eye /> },
                  { value: "markdown", label: "Markdown", icon: <Code2 /> },
                ]}
              />
            </div>
            <div className={cn("scrollbar-thin max-h-[56vh] min-h-64 overflow-y-auto rounded-card border border-line bg-surface-2 p-5 transition-opacity", loading && report && "opacity-60")}>
              {!report ? (
                <div className="flex h-56 items-center justify-center text-muted">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : mode === "preview" ? (
                <ReportPreview markdown={report.markdown} />
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-ink-2">{report.markdown}</pre>
              )}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <span className="mr-auto hidden truncate text-xs text-muted sm:block">{fileName}</span>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button disabled={!report || loading} onClick={copy}>
            <ClipboardCopy /> Copiar
          </Button>
          <Button variant="primary" disabled={!report || loading} onClick={download}>
            <Download /> Baixar .md
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
