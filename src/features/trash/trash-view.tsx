"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Loader2, RotateCcw, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Segmented, SiteIcon } from "@/components/ui/misc";
import { ask } from "@/components/ui/ask";
import { cn, timeAgo } from "@/lib/utils";
import { CollectionTile } from "@/features/links/collection-style";
import { deleteForeverAction, emptyTrashAction, restoreFromTrashAction } from "@/app/(app)/trash/actions";
import { TRASH_RETENTION_DAYS, type TrashItem, type TrashType } from "./types";

type Filter = TrashType | "all";

const DAY_MS = 24 * 60 * 60 * 1000;
const TYPE_LABEL: Record<TrashType, string> = { plan: "Plan", collection: "Coleção", favorite: "Link" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Where an item lives once restored. */
function hrefOf(item: TrashItem) {
  if (item.type === "plan") return `/plans/${item.id}`;
  if (item.type === "collection") return `/links?c=${item.id}`;
  return `/links?open=${encodeURIComponent(item.id)}`;
}

function daysLeft(item: TrashItem, now: number) {
  return Math.max(0, Math.ceil((item.purgeAt - now) / DAY_MS));
}

function purgeLabel(days: number) {
  if (days === 0) return "será excluído hoje";
  return `será excluído em ${plural(days, "dia", "dias")}`;
}

function contents(item: TrashItem) {
  const parts: string[] = [];
  if (item.collectionCount) parts.push(plural(item.collectionCount, "subcoleção", "subcoleções"));
  parts.push(plural(item.linkCount ?? 0, "link", "links"));
  return parts.join(" · ");
}

function ItemIcon({ item }: { item: TrashItem }) {
  if (item.type === "collection") return <CollectionTile icon={item.icon} color={item.color} size={32} />;
  if (item.type === "favorite") return <SiteIcon src={item.icon || item.favicon} label={item.title} size={32} />;
  return (
    <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
      <Workflow className="size-4" />
    </span>
  );
}

/** The trash: restore or delete for good what was deleted in the last 30 days. */
export function TrashView({ initial, canEditLibrary }: { initial: TrashItem[]; canEditLibrary: boolean }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [now] = React.useState(() => Date.now());

  React.useEffect(() => setItems(initial), [initial]);

  const counts = React.useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, plan: 0, collection: 0, favorite: 0 };
    for (const i of items) c[i.type]++;
    return c;
  }, [items]);
  const shown = filter === "all" ? items : items.filter((i) => i.type === filter);
  const keyOf = (i: TrashItem) => `${i.type}:${i.id}`;
  const drop = (i: TrashItem) => setItems((list) => list.filter((x) => keyOf(x) !== keyOf(i)));

  const restore = async (item: TrashItem) => {
    setBusy(keyOf(item));
    const res = await restoreFromTrashAction([{ type: item.type, id: item.id }]);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    drop(item);
    toast.success(`${TYPE_LABEL[item.type]} “${item.title}” restaurado${item.type === "collection" ? "a" : ""}`, {
      action: { label: "Abrir", onClick: () => router.push(hrefOf(item)) },
    });
    router.refresh();
  };

  const removeForever = async (item: TrashItem) => {
    const description =
      item.type === "collection" ? (
        <>
          A coleção{item.collectionCount ? " e suas subcoleções serão apagadas" : " será apagada"}.{" "}
          {item.linkCount ? (
            <>
              {item.linkCount === 1 ? "O link que estava nela irá" : `Os ${item.linkCount} links que estavam nela irão`} para{" "}
              <strong>{item.destination ?? "Sem coleção"}</strong> — nenhum link é perdido.
            </>
          ) : (
            "Não dá para desfazer."
          )}
        </>
      ) : item.type === "plan" ? (
        "O plan, suas versões publicadas e comentários serão apagados. Não dá para desfazer."
      ) : (
        "O link será apagado. Blocos de plans que apontavam para ele deixam de encontrá-lo. Não dá para desfazer."
      );
    const ok = await ask.confirm({ title: `Excluir “${item.title}” definitivamente?`, description, confirmLabel: "Excluir definitivamente", danger: true });
    if (!ok) return;
    setBusy(keyOf(item));
    const res = await deleteForeverAction({ type: item.type, id: item.id });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    drop(item);
    toast.success("Excluído definitivamente");
    if (item.type === "collection" && item.linkCount) router.refresh();
  };

  const empty = async () => {
    const withLinks = items.some((i) => i.type === "collection" && i.linkCount);
    const ok = await ask.confirm({
      title: "Esvaziar a lixeira?",
      description: (
        <>
          {plural(items.length, "item será apagado", "itens serão apagados")} para sempre.
          {withLinks && " Links que estavam dentro de coleções vão para a coleção de cima (ou Sem coleção) — nenhum link é perdido."}
        </>
      ),
      confirmLabel: "Esvaziar lixeira",
      danger: true,
    });
    if (!ok) return;
    setBusy("empty");
    const res = await emptyTrashAction();
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    setItems([]);
    toast.success("Lixeira esvaziada");
    router.refresh();
  };

  if (!items.length) {
    return (
      <EmptyState
        icon={<Trash2 />}
        title="A lixeira está vazia"
        description={`O que você excluir — plans${canEditLibrary ? ", coleções e links" : ""} — fica aqui por ${TRASH_RETENTION_DAYS} dias, caso mude de ideia.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/plans">
                <Workflow /> Plans
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/links">
                <Link2 /> Links
              </Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Filter>
          label="Filtrar por tipo"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `Tudo · ${counts.all}` },
            { value: "plan", label: `Plans · ${counts.plan}` },
            ...(canEditLibrary
              ? [
                  { value: "collection" as const, label: `Coleções · ${counts.collection}` },
                  { value: "favorite" as const, label: `Links · ${counts.favorite}` },
                ]
              : []),
          ]}
        />
        <span className="flex-1" />
        <Button variant="danger" size="sm" disabled={!!busy} onClick={empty}>
          {busy === "empty" ? <Loader2 className="animate-spin" /> : <Trash2 />} Esvaziar lixeira
        </Button>
      </div>

      {shown.length ? (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {shown.map((item) => {
            const days = daysLeft(item, now);
            const working = busy === keyOf(item);
            return (
              <li key={keyOf(item)} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 animate-in">
                <ItemIcon item={item} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-body font-medium">{item.title}</span>
                    <Badge className="shrink-0">{TYPE_LABEL[item.type]}</Badge>
                  </span>
                  <span className="truncate text-caption text-muted">
                    {item.type === "collection" ? contents(item) : item.detail || (item.type === "plan" ? "Sem descrição" : "")}
                    {item.type === "favorite" && !item.destination && " · volta para Sem coleção"}
                  </span>
                  <span className="text-caption text-muted" suppressHydrationWarning>
                    Excluído {timeAgo(item.deletedAt, now)} ·{" "}
                    <span className={cn(days <= 3 && "font-medium text-danger")}>{purgeLabel(days)}</span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Button size="sm" variant="soft" disabled={!!busy} onClick={() => restore(item)}>
                    {working ? <Loader2 className="animate-spin" /> : <RotateCcw />} Restaurar
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="hover:text-danger"
                    aria-label={`Excluir “${item.title}” definitivamente`}
                    title="Excluir definitivamente"
                    disabled={!!busy}
                    onClick={() => removeForever(item)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<Trash2 />}
          title={`Nenhum${filter === "collection" ? "a coleção" : filter === "plan" ? " plan" : " link"} na lixeira`}
          description="Os outros itens continuam aqui — veja Tudo."
          action={
            <Button size="sm" variant="ghost" onClick={() => setFilter("all")}>
              Ver tudo
            </Button>
          }
          className="py-10"
        />
      )}
    </div>
  );
}
