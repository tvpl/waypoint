"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { TagInput } from "./tag-input";
import type { TagCount } from "./types";

export function TagBatchDialog({
  ids,
  tags,
  existing,
  onClose,
  onApply,
}: {
  ids: string[] | null;
  tags: TagCount[];
  existing: string[];
  onClose: () => void;
  onApply: (ids: string[], add: string[], remove: string[]) => Promise<boolean>;
}) {
  return (
    <Dialog open={!!ids} onOpenChange={(o) => !o && onClose()}>
      {ids && (
        <DialogContent
          title={`Organizar tags de ${ids.length} ${ids.length === 1 ? "link" : "links"}`}
          className="max-w-[480px]"
        >
          <TagForm
            ids={ids}
            tags={tags}
            existing={existing}
            onClose={onClose}
            onApply={onApply}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
function TagForm({
  ids,
  tags,
  existing,
  onClose,
  onApply,
}: {
  ids: string[];
  tags: TagCount[];
  existing: string[];
  onClose: () => void;
  onApply: (ids: string[], add: string[], remove: string[]) => Promise<boolean>;
}) {
  const [add, setAdd] = useState<string[]>([]);
  const [remove, setRemove] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          if (await onApply(ids, add, remove)) onClose();
        } finally {
          setBusy(false);
        }
      }}
    >
      <DialogBody className="gap-4">
        <label htmlFor="batch-tags" className="text-body font-medium">
          Adicionar a todos
        </label>
        <TagInput
          id="batch-tags"
          value={add}
          onChange={setAdd}
          suggestions={tags}
        />
        {existing.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body font-medium">
              Remover da seleção
            </legend>
            {existing.map((tag) => (
              <label key={tag} className="flex items-center gap-2 text-body">
                <input
                  type="checkbox"
                  checked={remove.includes(tag)}
                  onChange={(e) =>
                    setRemove(
                      e.target.checked
                        ? [...remove, tag]
                        : remove.filter((t) => t !== tag),
                    )
                  }
                />
                #{tag}
              </label>
            ))}
          </fieldset>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={busy || (!add.length && !remove.length)}
        >
          {busy ? "Salvando…" : "Aplicar tags"}
        </Button>
      </DialogFooter>
    </form>
  );
}
