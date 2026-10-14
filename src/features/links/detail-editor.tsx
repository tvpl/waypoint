"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { updateLinkAction } from "@/app/(app)/links/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { CollectionPicker } from "./collection-picker";
import { TagInput } from "./tag-input";
import type { LinkItem, TagCount, TreeNode } from "./types";

export function DetailEditor({
  link,
  tree,
  tags,
  onSaved,
  onAdvanced,
}: {
  link: LinkItem;
  tree: TreeNode[];
  tags: TagCount[];
  onSaved: (patch: Partial<LinkItem>) => void;
  onAdvanced: () => void;
}) {
  const [draft, setDraft] = useState({
    title: link.title,
    url: link.url,
    description: link.description ?? "",
    notes: link.notes ?? "",
    collectionId: link.collectionId,
    tags: link.tags,
  });
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const change = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setError("");
  };
  const save = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    try {
      const patch = {
        ...draft,
        title: draft.title.trim(),
        url: draft.url.trim(),
        notes: draft.notes.trim() || null,
        description: draft.description.trim() || null,
      };
      const r = await updateLinkAction(link.id, patch);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onSaved(patch);
      setDirty(false);
      toast.success("Detalhes salvos");
    } catch {
      setError("Não foi possível salvar. Suas alterações continuam aqui.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <fieldset disabled={busy} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-title">Título</Label>
          <Input
            id="detail-title"
            value={draft.title}
            maxLength={500}
            onChange={(e) => change({ title: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-url">URL</Label>
          <Input
            id="detail-url"
            value={draft.url}
            maxLength={4096}
            spellCheck={false}
            onChange={(e) => change({ url: e.target.value })}
            className="font-mono text-body"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-collection">Coleção</Label>
          <CollectionPicker
            id="detail-collection"
            tree={tree}
            value={draft.collectionId}
            onChange={(collectionId) => change({ collectionId })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-tags">Tags</Label>
          <TagInput
            id="detail-tags"
            value={draft.tags}
            onChange={(tags) => change({ tags })}
            suggestions={tags}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-description">Descrição</Label>
          <Textarea
            id="detail-description"
            rows={3}
            value={draft.description}
            maxLength={5000}
            onChange={(e) => change({ description: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="detail-notes">Notas</Label>
          <Textarea
            id="detail-notes"
            rows={3}
            value={draft.notes}
            maxLength={5000}
            placeholder="Por que você salvou este link?"
            onChange={(e) => change({ notes: e.target.value })}
          />
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-body text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || !dirty}>
          {busy && <Loader2 className="animate-spin" />}
          {busy ? "Salvando…" : "Salvar detalhes"}
        </Button>
        <Button
          variant="ghost"
          disabled={busy || !dirty}
          onClick={() => {
            setDraft({
              title: link.title,
              url: link.url,
              description: link.description ?? "",
              notes: link.notes ?? "",
              collectionId: link.collectionId,
              tags: link.tags,
            });
            setDirty(false);
            setError("");
          }}
        >
          Desfazer edição
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onAdvanced}
        className="self-start"
      >
        <Pencil />
        Capa, ícone e opções de abertura
      </Button>
    </form>
  );
}
