import "server-only";
import Link from "next/link";
import { ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countTrash } from "@/server/services/trash";
import { TRASH_RETENTION_DAYS } from "./types";

/** Settings card body: how much is in this person's trash, with a link to it. */
export function TrashSummary({ actor }: { actor: { workspaceId: string; userId: string } }) {
  const n = countTrash(actor);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 shadow-rest">
      <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
        <Trash2 className="size-5" />
      </span>
      <span className="flex min-w-[200px] flex-1 flex-col">
        <span className="text-body font-semibold">{n ? `${n} ${n === 1 ? "item na lixeira" : "itens na lixeira"}` : "A lixeira está vazia"}</span>
        <span className="text-caption text-muted">Excluídos há mais de {TRASH_RETENTION_DAYS} dias são apagados de vez.</span>
      </span>
      <Button asChild variant={n ? "primary" : "secondary"}>
        <Link href="/trash">
          Abrir lixeira <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}
