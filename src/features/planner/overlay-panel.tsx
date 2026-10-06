"use client";
import * as React from "react";
import { Combine, History, Search, X } from "lucide-react";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/popover";
import { cn, timeAgo } from "@/lib/utils";
import { getShareStateAction } from "./actions";
import { useEditor } from "./editor-context";
import { ResourceRow, useResourceSearch } from "./resource-picker";

const iconBtn = "inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink [&_svg]:size-4";

/** "Sobrepor plan": another plan shown live on a layer of this one, to draw over it or compare. */
export function OverlayPlanButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Tooltip content="Sobrepor outro plan" side="right">
        <button type="button" aria-label="Sobrepor outro plan" className={iconBtn} onClick={() => setOpen(true)}>
          <Combine />
        </button>
      </Tooltip>
      {open && <OverlayDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function OverlayDialog({ onClose }: { onClose: () => void }) {
  const ed = useEditor();
  const [q, setQ] = React.useState("");
  const { items, loading } = useResourceSearch(q.trim(), { limit: 12, exclude: ed.planId, types: "plan" });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Sobrepor outro plan"
        description="Ele aparece numa camada nova, sempre na versão mais recente, só para ver e desenhar por cima. Nada é copiado para este plan."
        className="max-w-[520px]"
      >
        <DialogBody className="flex flex-col gap-3 pb-5">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 text-muted focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
            <Search className="size-4 shrink-0" aria-hidden />
            <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar plans" aria-label="Buscar plans" className="w-full bg-transparent text-body text-ink outline-none" />
          </label>
          <div className="-mx-2 flex max-h-[50vh] flex-col overflow-y-auto">
            {items?.map((it) => (
              <ResourceRow
                key={"id" in it.ref ? it.ref.id : it.resource.title}
                item={it}
                onPick={(i) => {
                  if (i.ref.type !== "plan") return;
                  ed.layers.addOverlay(i.ref.id, i.resource.title);
                  onClose();
                }}
              />
            ))}
            {items && !items.length && <p className="px-2 py-2 text-body text-muted">{loading ? "Buscando…" : q ? "Nenhum plan encontrado." : "Nenhum outro plan ainda."}</p>}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

type Version = { id: string; version: number; createdAt: number; title: string };

/** "Papel vegetal": an earlier version faded under the plan, to see what changed while editing. */
export function OnionSection() {
  const ed = useEditor();
  const L = ed.layers;
  const [versions, setVersions] = React.useState<Version[] | null>(null);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (!open || versions) return;
    void getShareStateAction(ed.planId).then((r) => setVersions(r.ok ? r.state.versions : []));
  }, [open, versions, ed.planId]);
  return (
    <section className="flex flex-col gap-1.5" aria-label="Papel vegetal">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-semibold uppercase tracking-[.06em] text-muted">Papel vegetal</span>
        {!L.onion && (
          <button type="button" className="text-caption font-medium text-accent-ink hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Fechar" : "Escolher versão"}
          </button>
        )}
      </div>
      {L.onion ? (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-body">
          <History className="size-3.5 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            Por baixo: <b className="font-semibold">{L.onion.label}</b>
          </span>
          <button type="button" aria-label="Tirar o papel vegetal" className="inline-flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink" onClick={() => L.setOnion(null)}>
            <X className="size-3.5" />
          </button>
        </div>
      ) : open ? (
        <ul className="-mx-2 flex max-h-[220px] flex-col overflow-y-auto">
          {versions === null && <li className="px-2 py-1.5 text-caption text-muted">Carregando versões…</li>}
          {versions?.length === 0 && <li className="px-2 py-1.5 text-caption text-muted">Publique o plan para ter versões para comparar.</li>}
          {versions?.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-body text-ink-2 hover:bg-surface-2 hover:text-ink")}
                onClick={() => {
                  L.setOnion({ versionId: v.id, label: `v${v.version}` });
                  setOpen(false);
                }}
              >
                <span className="font-medium tabular-nums">v{v.version}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{timeAgo(v.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption leading-4 text-muted">Mostra uma versão publicada, apagada, por baixo do que você está desenhando.</p>
      )}
    </section>
  );
}
