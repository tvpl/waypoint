"use client";
import * as React from "react";
import type { LinkItem, SortMode, SummaryBehavior } from "./types";

export type LibraryApi = {
  canEdit: boolean;
  archivedScope: boolean;
  selected: Set<string>;
  selectionMode: boolean;
  toggleSelect: (id: string, opts?: { range?: boolean }) => void;
  summaryFor: (link: LinkItem) => SummaryBehavior;
  /** Manual reordering is possible (manual sort, no filters, single container). */
  reorderable: boolean;
  dropOnLink: (dragIds: string[], targetId: string, pos: "before" | "after") => void;
  star: (link: LinkItem) => Promise<boolean | null>;
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
