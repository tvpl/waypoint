"use client";
import { toast } from "sonner";
import { restoreFromTrashAction } from "@/app/(app)/trash/actions";
import type { TrashRef } from "./types";

/**
 * "… movido para a lixeira" toast with a "Desfazer" that restores the items.
 * `onUndone` runs once they're back (refresh the view there).
 */
export function trashedToast(message: string, refs: TrashRef[], opts: { description?: string; onUndone?: () => void } = {}) {
  toast(message, {
    description: opts.description,
    duration: 7000,
    action: {
      label: "Desfazer",
      onClick: () => {
        restoreFromTrashAction(refs).then((r) => {
          if (!r.ok) return void toast.error(r.error);
          opts.onUndone?.();
        });
      },
    },
  });
}
