"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Download, FileUp, Folder, Link2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, SectionLabel } from "@/components/ui/input";
import { cn, normalizeTag } from "@/lib/utils";
import { CollectionPicker } from "./collection-picker";
import type { TreeNode } from "./types";
import { useEnrichRun } from "./enrich";

type Preview = { folders: number; links: number; topFolders: string[] };
type Result = { collections: number; links: number; skipped: number; collectionId: string | null };

const BROWSERS: { name: string; steps: string }[] = [
  { name: "Chrome", steps: "Menu ⋮ → Favoritos e listas → Gerenciador de favoritos (Ctrl+Shift+O) → ⋮ no canto → Exportar favoritos." },
  { name: "Edge", steps: "Menu … → Favoritos (Ctrl+Shift+O) → … → Exportar favoritos." },
  { name: "Firefox", steps: "Favoritos → Gerenciar favoritos (Ctrl+Shift+O) → Importar e backup → Exportar favoritos para HTML…" },
  { name: "Safari", steps: "Arquivo → Exportar → Favoritos… (salva um arquivo “Favoritos.html”)." },
  { name: "Brave / Arc / Opera", steps: "Use o gerenciador de favoritos e procure “Exportar favoritos” — o formato HTML é o mesmo." },
];

export function ImportScreen({ tree, canEdit, workspaceName }: { tree: TreeNode[]; canEdit: boolean; workspaceName: string }) {
  const router = useRouter();
  const enrich = useEnrichRun();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [parentId, setParentId] = React.useState<string | null>(null);
  const [wrap, setWrap] = React.useState(true);
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);
  const [wrapName, setWrapName] = React.useState(() => `Favoritos importados — ${new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(new Date())}`);
  const [tag, setTag] = React.useState("");
  const [result, setResult] = React.useState<Result | null>(null);
  const [over, setOver] = React.useState(false);

  const choose = async (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
    setParsing(true);
    const body = new FormData();
    body.set("file", f);
    body.set("dryRun", "1");
    const res = await fetch("/api/links/import", { method: "POST", body }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as (Preview & { error?: string }) | null;
    setParsing(false);
    if (!res?.ok || !json) {
      setError(json?.error ?? "Não foi possível ler o arquivo.");
      return;
    }
    setPreview(json);
  };

  const runImport = async () => {
    if (!file) return;
    setImporting(true);
    const body = new FormData();
    body.set("file", file);
    if (parentId) body.set("parentId", parentId);
    if (wrap) {
      body.set("wrap", "1");
      body.set("wrapName", wrapName);
    }
    if (tag.trim()) body.set("tag", tag);
    body.set("skipDuplicates", skipDuplicates ? "1" : "0");
    const res = await fetch("/api/links/import", { method: "POST", body }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as (Result & { error?: string }) | null;
    setImporting(false);
    if (!res?.ok || !json) {
      toast.error(json?.error ?? "A importação falhou. Tente novamente.");
      return;
    }
    setResult(json);
    router.refresh();
    // Imports carry only title + URL: fetch icons, covers and descriptions in the background.
    if (json.links > 0) void enrich({ collectionId: json.collectionId }, { quietWhenNothing: true });
  };

  const target = result?.collectionId ? `/links?c=${result.collectionId}` : "/links";

  return (
    <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[960px] flex-col gap-8 px-6 py-8 lg:px-10">
        <div className="flex flex-col gap-2">
          <Link href="/links" className="inline-flex items-center gap-1.5 self-start text-body text-muted hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden />
            Links
          </Link>
          <h1 className="font-display font-normal text-display-sm leading-[1.05] tracking-[-0.01em] sm:text-display">Importar e exportar</h1>
          <p className="max-w-[640px] text-sm text-muted">
            Traga os favoritos do navegador com todas as pastas — elas viram coleções no Waypoint. Ou baixe sua biblioteca para guardar uma cópia ou levar para outro lugar.
          </p>
        </div>

        {canEdit && (
          <section aria-labelledby="imp-h" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center gap-2">
              <Upload className="size-4 text-accent-ink" aria-hidden />
              <h2 id="imp-h" className="text-lead font-semibold">
                Importar favoritos do navegador
              </h2>
            </div>

            {result ? (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-success-bg/60 p-5">
                <span className="inline-flex items-center gap-2 text-lead font-semibold text-success-ink">
                  <CheckCircle2 className="size-5" aria-hidden />
                  Importação concluída
                </span>
                <p className="text-sm text-ink-2">
                  {result.links} {result.links === 1 ? "link importado" : "links importados"} em {result.collections}{" "}
                  {result.collections === 1 ? "nova coleção" : "novas coleções"}
                  {wrap ? ` (mais a coleção “${wrapName}”)` : ""}.
                  {result.skipped > 0 && ` ${result.skipped} ${result.skipped === 1 ? "página já existia e foi pulada" : "páginas já existiam e foram puladas"}.`}
                </p>
                <div className="flex gap-2">
                  <Button asChild variant="primary">
                    <Link href={target}>Ver links importados</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setResult(null);
                      setFile(null);
                      setPreview(null);
                    }}
                  >
                    Importar outro arquivo
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(true);
                  }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(false);
                    choose(e.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                    over ? "border-accent bg-accent-soft" : "border-line-2 bg-surface-2 hover:border-ink-2",
                  )}
                >
                  {parsing ? <Loader2 className="size-6 animate-spin text-muted" aria-hidden /> : <FileUp className="size-6 text-muted" aria-hidden />}
                  <span className="text-sm font-medium">{file ? file.name : "Escolha ou arraste o arquivo HTML exportado"}</span>
                  <span className="text-xs text-muted">Formato Netscape Bookmarks (.html) — Chrome, Edge, Firefox, Safari, Brave, Arc</span>
                </button>
                <input ref={fileRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
                {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-body text-danger">{error}</p>}

                {preview && (
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-wrap gap-3">
                      <Stat icon={<Link2 />} value={preview.links} label={preview.links === 1 ? "link" : "links"} />
                      <Stat icon={<Folder />} value={preview.folders} label={preview.folders === 1 ? "pasta" : "pastas"} />
                      {preview.topFolders.length > 0 && (
                        <p className="flex min-w-0 flex-1 items-center text-xs text-muted">Pastas principais: {preview.topFolders.join(", ")}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="imp-target">Importar dentro de</Label>
                        <CollectionPicker id="imp-target" tree={tree} value={parentId} onChange={setParentId} noneLabel="Raiz da biblioteca" />
                        <p className="text-xs text-muted">As pastas do navegador viram coleções dentro do destino.</p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="imp-tag">Tag para todos os links (opcional)</Label>
                        <Input id="imp-tag" className="h-[38px]" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="ex.: importado" />
                        {tag && normalizeTag(tag) !== tag && <p className="text-xs text-muted">Será salva como #{normalizeTag(tag)}</p>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-body text-ink-2">
                        <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} className="m-0 accent-[var(--accent)]" />
                        Agrupar tudo em uma nova coleção
                      </label>
                      {wrap && <Input aria-label="Nome da nova coleção" value={wrapName} onChange={(e) => setWrapName(e.target.value)} className="h-[38px] max-w-md" />}
                      <label className="flex items-center gap-2 text-body text-ink-2">
                        <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} className="m-0 accent-[var(--accent)]" />
                        Pular páginas que já estão na biblioteca
                        <span className="text-xs text-muted">(mesmo com www., http/https ou utm_ diferentes)</span>
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button variant="primary" onClick={runImport} disabled={importing || preview.links === 0}>
                        {importing ? <Loader2 className="animate-spin" /> : <Upload />}
                        Importar {preview.links} {preview.links === 1 ? "link" : "links"}
                      </Button>
                      <span className="text-xs text-muted">Ícones, capas e descrições são buscados logo depois, em segundo plano.</span>
                    </div>
                  </div>
                )}
              </>
            )}

            <details className="group rounded-xl border border-line bg-surface-2 px-4 py-3">
              <summary className="cursor-pointer text-body font-medium text-ink-2 marker:text-muted">Como exportar os favoritos do seu navegador</summary>
              <dl className="mt-3 flex flex-col gap-2.5">
                {BROWSERS.map((b) => (
                  <div key={b.name} className="grid grid-cols-[120px_1fr] gap-3 text-body">
                    <dt className="font-medium">{b.name}</dt>
                    <dd className="text-ink-2">{b.steps}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>
        )}

        <section aria-labelledby="exp-h" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
          <div className="flex items-center gap-2">
            <Download className="size-4 text-accent-ink" aria-hidden />
            <h2 id="exp-h" className="text-lead font-semibold">
              Exportar biblioteca
            </h2>
          </div>
          <ExportBlock tree={tree} workspaceName={workspaceName} />
        </section>
      </div>
    </main>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2 [&_svg]:size-4 [&_svg]:text-muted">
      {icon}
      <span className="text-lead font-semibold tabular-nums">{value.toLocaleString("pt-BR")}</span>
      <span className="text-body text-muted">{label}</span>
    </span>
  );
}

function ExportBlock({ tree, workspaceName }: { tree: TreeNode[]; workspaceName: string }) {
  const [scope, setScope] = React.useState<string | null>(null);
  const q = scope ? `&c=${scope}` : "";
  const formats = [
    { f: "html", label: "HTML", sub: "Favoritos do navegador, com pastas" },
    { f: "csv", label: "CSV", sub: "Planilhas (Excel, Sheets, Numbers)" },
    { f: "json", label: "JSON", sub: "Backup completo, para integrações" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-md flex-col gap-1.5">
        <SectionLabel>O que exportar</SectionLabel>
        <CollectionPicker tree={tree} value={scope} onChange={setScope} noneLabel="Biblioteca inteira" />
        <p className="text-xs text-muted">{scope ? "Somente esta coleção e suas subcoleções." : `Todo o workspace “${workspaceName}” (escolha uma coleção para limitar).`}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {formats.map((x) => (
          <a
            key={x.f}
            href={`/api/export/links?format=${x.f}${q}`}
            download
            className="flex flex-col gap-1 rounded-xl border border-line bg-surface-2 px-4 py-3 transition-colors hover:border-accent-line hover:bg-accent-soft"
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <Download className="size-4 text-muted" aria-hidden />
              {x.label}
            </span>
            <span className="text-xs text-muted">{x.sub}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
