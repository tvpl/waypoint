"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label, Textarea } from "@/components/ui/input";
import {
  bulkLinksAction,
  createLinksBatchAction,
  reviewLinksAction,
  type BatchReview,
} from "@/app/(app)/links/actions";
import { MAX_BATCH_LINKS, parseBatchUrls } from "./batch-urls";
import { CollectionPicker } from "./collection-picker";
import { TagInput } from "./tag-input";
import type { TagCount, TreeNode } from "./types";

export function BatchLinksDialog({
  initial,
  collectionId,
  tree,
  tags,
  onClose,
  onSaved,
}: {
  initial: string | null;
  collectionId: string | null;
  tree: TreeNode[];
  tags: TagCount[];
  onClose: () => void;
  onSaved: (ids: string[], collectionId: string | null, enrich: boolean) => void;
}) {
  return (
    <Dialog open={initial !== null} onOpenChange={(o) => !o && onClose()}>
      {initial !== null && (
        <DialogContent
          title="Adicionar vários links"
          description="Cole um endereço por linha. Revise os duplicados antes de salvar."
          className="max-w-[660px]"
        >
          <BatchForm
            initial={initial}
            collectionId={collectionId}
            tree={tree}
            tags={tags}
            onClose={onClose}
            onSaved={onSaved}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
function BatchForm({
  initial,
  collectionId,
  tree,
  tags,
  onClose,
  onSaved,
}: {
  initial: string;
  collectionId: string | null;
  tree: TreeNode[];
  tags: TagCount[];
  onClose: () => void;
  onSaved: (ids: string[], collectionId: string | null, enrich: boolean) => void;
}) {
  const [text, setText] = useState(initial);
  const [collection, setCollection] = useState(collectionId);
  const [tagList, setTags] = useState<string[]>([]);
  const [enrich, setEnrich] = useState(false);
  const [review, setReview] = useState<BatchReview[] | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseBatchUrls(text), [text]);
  const valid =
    parsed.urls.length > 0 &&
    parsed.urls.length <= MAX_BATCH_LINKS &&
    parsed.invalid.length === 0;
  const submit = async () => {
    if (busy || !valid) return;
    setBusy(true);
    try {
      if (!review) {
        const r = await reviewLinksAction(parsed.urls);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        setReview(r.data!);
      } else {
        const r = await createLinksBatchAction({
          urls: parsed.urls,
          collectionId: collection,
          tags: tagList,
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        const savedIds = r.data!.ids;
        toast.success(`${savedIds.length} links salvos`, {
          description: r.data!.skipped
            ? `${r.data!.skipped} duplicados ignorados.`
            : undefined,
          action: savedIds.length
            ? {
                label: "Desfazer",
                onClick: async () => {
                  const undone = await bulkLinksAction({
                    op: "archive",
                    ids: savedIds,
                    archived: true,
                  });
                  if (!undone.ok) toast.error(undone.error);
                  else toast.success("Links do lote arquivados");
                },
              }
            : undefined,
        });
        onSaved(savedIds, collection, enrich && savedIds.length > 0);
        onClose();
      }
    } catch {
      toast.error("Não foi possível salvar os links. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <DialogBody className="gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="batch-urls">Endereços</Label>
          <Textarea
            id="batch-urls"
            autoFocus
            rows={6}
            value={text}
            disabled={busy}
            placeholder={
              "https://exemplo.com/artigo\nhttps://outro.com/referencia"
            }
            onChange={(e) => {
              setText(e.target.value);
              setReview(null);
            }}
            className="font-mono text-body"
          />
          <p className="text-caption text-muted">
            {parsed.urls.length} de {MAX_BATCH_LINKS} links · {parsed.repeated}{" "}
            repetidos no texto
          </p>
          {parsed.invalid.length > 0 && (
            <p role="alert" className="text-body text-danger">
              Revise {parsed.invalid.length}{" "}
              {parsed.invalid.length === 1
                ? "endereço inválido"
                : "endereços inválidos"}
              : {parsed.invalid[0].slice(0, 100)}
            </p>
          )}
          {parsed.urls.length > MAX_BATCH_LINKS && (
            <p role="alert" className="text-body text-danger">
              Use até {MAX_BATCH_LINKS} links por lote.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="batch-collection">Coleção para todos</Label>
          <CollectionPicker
            id="batch-collection"
            tree={tree}
            value={collection}
            onChange={setCollection}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Tags para todos</Label>
          <TagInput value={tagList} onChange={setTags} suggestions={tags} />
        </div>
        <label className="flex items-center gap-2 text-body">
          <input
            type="checkbox"
            checked={enrich}
            onChange={(e) => setEnrich(e.target.checked)}
          />
          Buscar títulos, ícones e capas em segundo plano
        </label>
        {review && (
          <div className="flex flex-col gap-2 rounded-control border border-line p-3">
            <p className="text-body font-medium">
              {review.filter((l) => !l.existingId).length} novos ·{" "}
              {review.filter((l) => l.existingId).length} já salvos
            </p>
            <ul className="scrollbar-thin max-h-40 overflow-y-auto text-body">
              {review.map((l) => (
                <li
                  key={l.url}
                  className="flex items-center gap-2 border-b border-line py-2 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate" title={l.url}>
                    {l.title ?? l.url}
                  </span>
                  <span className="shrink-0 text-caption text-muted">
                    {l.existingId
                      ? l.archived
                        ? "Já arquivado"
                        : "Já salvo"
                      : "Novo"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-caption text-muted">
              Links já salvos serão preservados e ignorados neste lote.
            </p>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={
            busy || !valid || (!!review && review.every((l) => !!l.existingId))
          }
        >
          {busy && <Loader2 className="animate-spin" />}
          {review ? "Salvar novos links" : "Revisar links"}
        </Button>
      </DialogFooter>
    </form>
  );
}
