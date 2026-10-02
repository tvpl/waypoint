"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Link2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { openPalette } from "@/lib/theme";
import { createPlanAction } from "@/app/(app)/plans/actions";

export function NewPlanButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const id = await createPlanAction({});
          router.push(`/plans/${id}/edit`);
        })
      }
    >
      <Plus /> Novo plan
    </Button>
  );
}

export function AddLinkButton() {
  return (
    <Button variant="primary" asChild>
      <Link href="/links?add=1">
        <Link2 /> Adicionar link
      </Link>
    </Button>
  );
}

export function SearchBar() {
  return (
    <button
      type="button"
      onClick={() => openPalette()}
      className="flex h-[58px] w-full items-center gap-3 rounded-card border border-line-2 bg-surface px-[18px] text-left text-base text-muted shadow-[0_1px_2px_rgba(23,23,28,.04),0_12px_32px_-20px_rgba(23,23,28,.25)] transition-colors hover:border-accent-line"
    >
      <Search className="size-5" />
      <span className="flex-1 truncate">Buscar plans, blocos, links, coleções, tags…</span>
      <span className="hidden gap-1 sm:flex">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
