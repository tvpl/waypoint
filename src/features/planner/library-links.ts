"use client";
/**
 * Linked copies of "Minha biblioteca" items inside the editor: which items the plan uses, which
 * copies are behind their item or were changed here, and the actions to update a copy, send its
 * changes back to the item, or unlink it.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { PlanDocument } from "@/domain/plan";
import { instanceContent, instanceEdited, libraryInstances, unlinkInstance, updateInstance, type LibraryInstance, type LibraryItem } from "@/domain/library";
import { getLibraryItemsAction, updateLibraryItemAction } from "@/app/(app)/plans/library-actions";
import { newId } from "@/lib/utils";

export type LinkState = "current" | "behind" | "edited" | "both" | "missing";

export type LinkedCopy = LibraryInstance & { name: string; state: LinkState };

export type LibraryLinks = {
  /** Every linked copy in the plan, with where it stands. */
  copies: LinkedCopy[];
  /** The copy an element belongs to. */
  copyOf: (nodeId: string) => LinkedCopy | null;
  /** Brings a copy (or every copy behind its item) to the item's current drawing. */
  update: (instance: string) => void;
  updateAll: () => void;
  /** Sends a copy's drawing to its item (the other copies here follow if unchanged). */
  push: (instance: string) => Promise<void>;
  unlink: (instance: string) => void;
};

type Deps = {
  nodes: { id: string; data: { libraryRef?: { item: string; rev: string; instance: string; node: string } } }[];
  docOf: () => PlanDocument;
  mutate: (fn: (d: PlanDocument) => PlanDocument, opts?: { key?: string }) => void;
  canEdit: boolean;
};

export function useLibraryLinks({ nodes, docOf, mutate, canEdit }: Deps): LibraryLinks {
  const [items, setItems] = useState<Map<string, LibraryItem>>(new Map());
  // Items the plan links to (a stable key, so a move doesn't refetch).
  const itemIds = useMemo(() => [...new Set(nodes.flatMap((n) => (n.data.libraryRef ? [n.data.libraryRef.item] : [])))].sort(), [nodes]);
  const itemKey = itemIds.join(",");
  const [missing, setMissing] = useState<Set<string>>(new Set());

  const refresh = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const r = await getLibraryItemsAction(ids);
    if (!r.ok) return;
    setItems((cur) => {
      const next = new Map(cur);
      for (const it of r.items) next.set(it.id, it);
      return next;
    });
    const found = new Set(r.items.map((i) => i.id));
    setMissing(new Set(ids.filter((id) => !found.has(id))));
  }, []);

  useEffect(() => {
    void refresh(itemKey ? itemKey.split(",") : []);
    // Coming back to the window: another plan may have changed an item.
    const onFocus = () => void refresh(itemKey ? itemKey.split(",") : []);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [itemKey, refresh]);

  // Comparing each copy with its item is not urgent: it waits while something is being dragged.
  const settled = useDeferredValue(nodes);
  const copies = useMemo<LinkedCopy[]>(() => {
    if (!settled.some((n) => n.data.libraryRef)) return [];
    const full = docOf();
    return libraryInstances(full).map((inst) => {
      const item = items.get(inst.item);
      if (!item) return { ...inst, name: "", state: missing.has(inst.item) ? "missing" : "current" };
      const behind = item.rev !== inst.rev;
      const edited = instanceEdited(full, inst);
      const state: LinkState = behind && edited ? "both" : behind ? "behind" : edited ? "edited" : "current";
      return { ...inst, name: item.name, state };
    });
    // docOf reads the refs; `settled` is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, items, missing]);

  const byNode = useMemo(() => {
    const m = new Map<string, LinkedCopy>();
    for (const c of copies) for (const id of c.nodes) m.set(id, c);
    return m;
  }, [copies]);

  // Once per opening: say when copies are behind their items.
  const told = useRef(false);
  const updateAllRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (told.current || !canEdit) return;
    const behind = copies.filter((c) => c.state === "behind" || c.state === "both");
    if (!behind.length) return;
    told.current = true;
    toast(behind.length === 1 ? `“${behind[0].name || "Item"}” mudou na biblioteca` : `${behind.length} itens da biblioteca mudaram`, {
      description: "As cópias neste plan podem ser atualizadas.",
      action: { label: "Atualizar", onClick: () => updateAllRef.current() },
      duration: 10_000,
    });
  }, [copies, canEdit]);

  const update = useCallback(
    (instance: string) => {
      const c = copies.find((x) => x.instance === instance);
      const item = c && items.get(c.item);
      if (!item) return;
      mutate((d) => updateInstance(d, instance, item.content, item.rev, newId));
    },
    [copies, items, mutate],
  );

  const updateAll = useCallback(() => {
    const todo = copies.filter((c) => (c.state === "behind" || c.state === "both") && items.has(c.item));
    if (!todo.length) return;
    mutate((d) => todo.reduce((acc, c) => updateInstance(acc, c.instance, items.get(c.item)!.content, items.get(c.item)!.rev, newId), d));
    toast(todo.length === 1 ? "Cópia atualizada" : `${todo.length} cópias atualizadas`);
  }, [copies, items, mutate]);
  updateAllRef.current = updateAll;

  const push = useCallback(
    async (instance: string) => {
      const c = copies.find((x) => x.instance === instance);
      if (!c) return;
      const content = instanceContent(docOf(), instance);
      if (!content) return;
      const r = await updateLibraryItemAction(c.item, content);
      if (!r.ok) return void toast.error(r.error);
      const item = { ...(items.get(c.item) ?? { id: c.item, name: c.name, createdAt: Date.now() }), content, rev: r.rev } as LibraryItem;
      setItems((cur) => new Map(cur).set(c.item, item));
      // This copy is now the item; the other unchanged copies here follow it.
      const others = copies.filter((x) => x.item === c.item && x.instance !== instance && x.state === "current");
      mutate((d) => {
        let next = {
          ...d,
          nodes: d.nodes.map((n) => (n.data.libraryRef?.instance === instance ? { ...n, data: { ...n.data, libraryRef: { ...n.data.libraryRef, rev: r.rev } } } : n)),
        };
        for (const o of others) next = updateInstance(next, o.instance, content, r.rev, newId);
        return next;
      });
      toast(`“${c.name || "Item"}” atualizado na biblioteca`, { description: "Os outros plans que usam este item vão oferecer a atualização." });
    },
    [copies, items, docOf, mutate],
  );

  const unlink = useCallback((instance: string) => mutate((d) => unlinkInstance(d, instance)), [mutate]);

  return { copies, copyOf: (id) => byNode.get(id) ?? null, update, updateAll, push, unlink };
}
