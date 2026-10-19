"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDesktop } from "@/lib/desktop";
import { fold } from "@/domain/tasks";
import { cn } from "@/lib/utils";
import { HELP_MODULES } from "./guides";
import { StartTourButton } from "./help-actions";
import { tourSeen } from "./tour";

/** The help home: every module with what it is for, a search across all guides and the tours. */
export function HelpCenter() {
  const desktop = useDesktop();
  const [query, setQuery] = React.useState("");
  const [seen, setSeen] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setSeen(new Set(HELP_MODULES.filter((m) => tourSeen(m.id)).map((m) => m.id))), []);
  const modules = HELP_MODULES.filter((m) => !m.desktopOnly || desktop);
  const q = fold(query.trim());
  const results = q
    ? modules.flatMap((m) =>
        [
          ...m.features.map((f) => ({ module: m, title: f.title, text: f.text })),
          ...(m.tips ?? []).map((t) => ({ module: m, title: "Dica", text: t })),
          ...(m.shortcuts ?? []).map(([label, keys]) => ({ module: m, title: "Atalho", text: `${label}: ${keys}` })),
          { module: m, title: m.title, text: `${m.summary} ${m.purpose}` },
        ].filter((r) => fold(`${r.title} ${r.text}`).includes(q)),
      )
    : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Como faço para… (ex.: backup, ocultar concluídas, atalhos, camadas)"
          aria-label="Buscar na ajuda"
          className="h-14 rounded-2xl pl-12 text-lead shadow-rest"
        />
      </div>

      {q ? (
        <section className="flex flex-col gap-2" aria-label="Resultados">
          <p className="text-body text-muted">{results.length ? `${results.length} resultado(s)` : "Nada encontrado. Tente outra palavra."}</p>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {results.slice(0, 40).map((r, i) => (
              <li key={i}>
                <Link href={`/help/${r.module.id}`} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink [&_svg]:size-4">
                    <r.module.icon />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-body font-semibold">
                      {r.title} <span className="font-normal text-muted">· {r.module.title}</span>
                    </span>
                    <span className="text-body leading-5 text-ink-2">{r.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Módulos">
            {modules.map((m, i) => (
              <article
                key={m.id}
                className="group flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-rest transition-[box-shadow,transform] animate-stagger hover:-translate-y-0.5 hover:shadow-raise"
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink [&_svg]:size-5">
                    <m.icon />
                  </span>
                  <h2 className="text-lead font-semibold">{m.title}</h2>
                  {seen.has(m.id) && (
                    <span className="ml-auto inline-flex items-center gap-1 text-caption text-success-ink" title="Tour feito">
                      <CircleCheck className="size-3.5" /> Visto
                    </span>
                  )}
                </div>
                <p className="flex-1 text-body leading-5 text-ink-2">{m.summary}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/help/${m.id}`} className="inline-flex items-center gap-1 text-body font-medium text-accent-ink hover:underline">
                    Ver o guia <ArrowRight className="size-3.5" />
                  </Link>
                  {m.tour.length > 0 && m.href && (
                    <span className="ml-auto">
                      <StartTourButton id={m.id} href={m.href} steps={m.tour.length} size="sm" variant="soft" />
                    </span>
                  )}
                </div>
              </article>
            ))}
          </section>
          <section className={cn("flex flex-wrap items-center gap-4 rounded-card border border-accent-line bg-accent-soft/60 p-5")}>
            <Sparkles className="size-5 text-accent-ink" />
            <p className="min-w-0 flex-1 text-body leading-5 text-ink-2">
              <b className="font-semibold text-ink">Dica:</b> o botão <b className="font-semibold">Ajuda</b> na barra lateral sabe em que módulo você está e começa o tour dali mesmo. A busca
              global (⌘K) também tem “Fazer o tour desta página”.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
