import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Keyboard, Lightbulb, ListChecks, Target } from "lucide-react";
import { requireWorkspace } from "@/server/services/workspaces";
import { isDesktop } from "@/server/desktop";
import { HELP_MODULES, helpModule } from "@/features/help/guides";
import { StartTourButton } from "@/features/help/help-actions";
import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const m = helpModule((await params).id);
  return { title: m ? `Ajuda · ${m.title}` : "Ajuda" };
}

export default async function HelpModulePage({ params }: { params: Promise<{ id: string }> }) {
  await requireWorkspace();
  const { id } = await params;
  const desktop = isDesktop();
  const m = helpModule(id);
  if (!m || (m.desktopOnly && !desktop)) notFound();
  const modules = HELP_MODULES.filter((x) => !x.desktopOnly || desktop);

  return (
    <main className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-6 pb-16 pt-8 sm:px-10 sm:pt-10 md:flex-row md:items-start md:gap-10">
        <nav aria-label="Módulos" className="scrollbar-none -mx-6 flex gap-1 overflow-x-auto px-6 md:sticky md:top-8 md:mx-0 md:w-52 md:shrink-0 md:flex-col md:px-0">
          <Link href="/help" className="mb-1 inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-body text-muted hover:bg-hover hover:text-ink">
            <ArrowLeft className="size-4" /> Central de ajuda
          </Link>
          {modules.map((x) => (
            <Link
              key={x.id}
              href={`/help/${x.id}`}
              aria-current={x.id === m.id ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-body transition-colors [&_svg]:size-4",
                x.id === m.id ? "bg-surface font-medium text-ink shadow-rest ring-1 ring-line [&_svg]:text-accent-ink" : "text-ink-2 hover:bg-hover hover:text-ink [&_svg]:text-muted",
              )}
            >
              <x.icon /> {x.title}
            </Link>
          ))}
        </nav>

        <article className="flex min-w-0 flex-1 flex-col gap-8 animate-in">
          <header className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink [&_svg]:size-7">
                <m.icon />
              </span>
              <div className="flex flex-col gap-1">
                <h1 className="font-display text-display-sm font-semibold leading-tight tracking-[-0.02em]">{m.title}</h1>
                <p className="text-lead text-muted">{m.summary}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <StartTourButton id={m.id} href={m.href} steps={m.tour.length} />
            </div>
          </header>

          <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5 shadow-rest">
            <h2 className="flex items-center gap-2 text-body font-semibold uppercase tracking-[.06em] text-muted">
              <Target className="size-4" /> Para que serve
            </h2>
            <p className="text-lead leading-7 text-ink-2">{m.purpose}</p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-title font-semibold">O que dá para fazer</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {m.features.map((f, i) => (
                <div key={f.title} className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4 animate-stagger" style={{ animationDelay: `${i * 30}ms` }}>
                  <h3 className="text-body font-semibold">{f.title}</h3>
                  <p className="text-body leading-5 text-ink-2">{f.text}</p>
                </div>
              ))}
            </div>
          </section>

          {m.tour.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-title font-semibold">
                <ListChecks className="size-5 text-accent-ink" /> Passo a passo
              </h2>
              <ol className="flex flex-col">
                {m.tour.map((s, i) => (
                  <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                    {i < m.tour.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-28px)] w-px bg-line-2" />}
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent-line bg-accent-soft text-caption font-semibold text-accent-ink">{i + 1}</span>
                    <div className="flex flex-col gap-0.5 pt-1">
                      <h3 className="text-body font-semibold">{s.title}</h3>
                      <p className="text-body leading-5 text-ink-2">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {!!m.tips?.length && (
              <section className="flex flex-col gap-3 rounded-card border border-amber-line bg-amber-bg/50 p-5">
                <h2 className="flex items-center gap-2 text-body font-semibold text-amber-ink">
                  <Lightbulb className="size-4" /> Dicas
                </h2>
                <ul className="flex flex-col gap-2">
                  {m.tips.map((t) => (
                    <li key={t} className="flex gap-2 text-body leading-5 text-ink-2">
                      <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-amber-ink" />
                      {t}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!!m.shortcuts?.length && (
              <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
                <h2 className="flex items-center gap-2 text-body font-semibold">
                  <Keyboard className="size-4 text-muted" /> Atalhos
                </h2>
                <dl className="flex flex-col divide-y divide-line">
                  {m.shortcuts.map(([label, keys]) => (
                    <div key={label} className="flex items-center justify-between gap-3 py-2">
                      <dt className="text-body text-ink-2">{label}</dt>
                      <dd className="flex shrink-0 gap-1">
                        {keys.split(" ").map((k, i) => (
                          <Kbd key={i}>{k}</Kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}
