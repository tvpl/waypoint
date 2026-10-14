"use client";
import * as React from "react";
import type { DisplaySettings } from "./display";
import type { LinkItem, SortMode, SummaryBehavior } from "./types";

export type LibraryApi = {
  display: DisplaySettings;
  updateDisplay: (patch: Partial<DisplaySettings>) => void;
  addTags: (ids: string[]) => void;
  bulkStar: (ids: string[], on: boolean) => void;
  copyUrls: (ids: string[]) => void;
  inspect: (link: LinkItem) => void;
  canEdit: boolean;
  archivedScope: boolean;
  /** Selected link ids — read it through useSelected / useSelectionMode so only affected items re-render. */
  selection: SelectionStore;
  toggleSelect: (id: string, opts?: { range?: boolean }) => void;
  summaryFor: (link: LinkItem) => SummaryBehavior;
  /** Manual reordering is possible (manual sort, no filters, single container). */
  reorderable: boolean;
  dropOnLink: (dragIds: string[], targetId: string, pos: "before" | "after",
  ) => void;
  star: (link: LinkItem) => Promise<boolean | null>;
  /** Pins/unpins to the user's quick access. */
  pin: (link: LinkItem) => void;
  /** Free-text search terms to highlight in titles and summaries. */
  highlight: string[];
  /** Color name of a tag (null = neutral). */
  tagColor: (tag: string) => string | null;
  edit: (link: LinkItem) => void;
  move: (ids: string[]) => void;
  archive: (ids: string[], archived: boolean) => void;
  remove: (ids: string[]) => void;
  filterTag: (tag: string) => void;
  sortBy: (sort: SortMode) => void;
  /** Re-checks links right away (editors). */
  checkLinks: (ids: string[]) => void;
  /** Replaces the URL of a redirecting link by its final URL (editors). */
  applyRedirect: (link: LinkItem) => void;
  sort: SortMode;
};

export const LibraryContext = React.createContext<LibraryApi | null>(null);

export function useLibrary(): LibraryApi {
  const ctx = React.useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used inside LibraryContext");
  return ctx;
}

// ------------------------------------------------------------------ selection store

export type SelectionStore = {
  get: () => Set<string>;
  set: (next: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  subscribe: (cb: () => void) => () => void;
};

export function createSelectionStore(): SelectionStore {
  let value = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      const v = typeof next === "function" ? next(value) : next;
      if (v === value || (v.size === 0 && value.size === 0)) return;
      value = v;
      listeners.forEach((l) => l());
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

const noServer = () => false;

/** Whether one link is selected (re-renders only when that answer changes). */
export function useSelected(id: string): boolean {
  const { selection } = useLibrary();
  return React.useSyncExternalStore(selection.subscribe, () => selection.get().has(id), noServer);
}

/** Whether anything is selected (clicks then toggle selection instead of opening). */
export function useSelectionMode(): boolean {
  const { selection } = useLibrary();
  return React.useSyncExternalStore(selection.subscribe, () => selection.get().size > 0, noServer);
}
