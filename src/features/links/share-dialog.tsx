"use client";
import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { regenerateShareLinkAction, shareCollectionAction } from "@/app/(app)/links/actions";
import { VisibilityChoice } from "./collection-dialog";
import type { TreeNode } from "./types";

type V = "workspace" | "private" | "link" | "public";

export function ShareDialog({ node, initialToken, onClose }: { node: TreeNode | null; initialToken?: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!node} onOpenChange={(o) => !o && onClose()}>
      {node && (
        <DialogContent title="Compartilhar coleção" description={`“${node.name}” e suas subcoleções`} className="max-w-[560px]">
          <ShareBody key={node.id} node={node} initialToken={initialToken ?? null} onClose={onClose} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function ShareBody({ node, initialToken, onClose }: { node: TreeNode; initialToken: string | null; onClose: () => void }) {
  const [visibility, setVisibility] = React.useState<V>(node.visibility === "specific" ? "workspace" : node.visibility);
  const [token, setToken] = React.useState<string | null>(initialToken);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const shared = visibility === "link" || visibility === "public";

  const apply = React.useCallback(
    async (v: V) => {
      setBusy(true);
      const res = await shareCollectionAction(node.id, v);
      setBusy(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setVisibility(v);
      setToken(res.data?.token ?? null);
    },
    [node.id],
  );

  // A shared collection opened from the tree may not have its token loaded yet.
  React.useEffect(() => {
    if ((node.visibility === "link" || node.visibility === "public") && !initialToken) apply(node.visibility);
  }, [node.visibility, initialToken, apply]);

  const url = token ? `${typeof window === "undefined" ? "" : window.location.origin}/share/${token}` : "";

  return (
    <>
      <DialogBody className="gap-4 pt-3">
        <VisibilityChoice value={visibility} onChange={(v) => v !== visibility && apply(v)} />
        {shared ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink-2">Link de compartilhamento</span>
            <div className="flex items-center gap-2">
              <input
                readOnly
                aria-label="Link de compartilhamento"
                value={busy && !token ? "Gerando link…" : url}
                onFocus={(e) => e.target.select()}
                className="h-9 min-w-0 flex-1 rounded-control border border-line-2 bg-surface-2 px-3 font-mono text-xs text-ink outline-none"
              />
              <Button
                variant="secondary"
                disabled={!url}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  } catch {
                    toast.error("Não foi possível copiar.");
                  }
                }}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
              {url && (
                <Button asChild variant="ghost" size="icon" aria-label="Abrir link compartilhado em nova aba">
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink />
                  </a>
                </Button>
              )}
            </div>
            <p className="text-xs leading-5 text-muted">
              Quem tiver o link vê esta coleção, suas subcoleções (exceto as privadas) e os links — somente leitura.
              {visibility === "public" && " Coleções públicas também podem ser abertas sem o link."}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await regenerateShareLinkAction(node.id);
                setBusy(false);
                if (!res.ok) return toast.error(res.error);
                setToken(res.data?.token ?? null);
                toast.success("Novo link gerado. O anterior deixou de funcionar.");
              }}
              className="inline-flex items-center gap-1.5 self-start text-xs text-ink-2 hover:text-ink disabled:opacity-50"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Gerar novo link (invalida o atual)
            </button>
          </div>
        ) : (
          <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-body text-ink-2">
            {visibility === "private" ? "Somente você vê esta coleção." : "Visível para os membros do workspace."} Escolha “Qualquer pessoa com o link” para gerar um link
            de leitura.
          </p>
        )}
      </DialogBody>
      <DialogFooter className="justify-end">
        {busy && <Loader2 className="mr-auto size-4 animate-spin text-muted" aria-label="Salvando" />}
        <Button variant="primary" onClick={onClose}>
          Concluído
        </Button>
      </DialogFooter>
    </>
  );
}
