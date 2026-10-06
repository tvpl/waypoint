"use client";
import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/misc";
import { openPalette } from "@/lib/theme";

export function SearchBar() {
  return (
    <button
      type="button"
      onClick={() => openPalette()}
      className="flex h-[52px] w-full items-center gap-3 rounded-card border border-line-2 bg-surface px-[18px] text-left text-base text-muted shadow-[0_1px_2px_rgba(23,23,28,.04),0_12px_32px_-20px_rgba(23,23,28,.25)] transition-colors hover:border-accent-line"
    >
      <Search className="size-5" />
      <span className="flex-1 truncate">Buscar ou abrir: plans, blocos, links, coleções, tags…</span>
      <span className="hidden gap-1 sm:flex">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
