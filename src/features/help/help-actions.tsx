"use client";
import Link from "next/link";
import { Keyboard, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openShortcuts } from "@/components/shell/shortcuts";
import { startTour } from "./events";

/** Starts a module's tour (navigating to the module first); modules tied to a page link there instead. */
export function StartTourButton({ id, href, steps, size = "md", variant = "primary" }: { id: string; href: string | null; steps: number; size?: "sm" | "md"; variant?: "primary" | "secondary" | "soft" }) {
  if (!steps) return null;
  if (!href)
    return (
      <Button asChild size={size} variant={variant === "primary" ? "secondary" : variant}>
        <Link href="/plans">
          <PlayCircle /> Abra um plan e use Ajuda no menu ⋯
        </Link>
      </Button>
    );
  return (
    <Button size={size} variant={variant} onClick={() => startTour(id)}>
      <PlayCircle /> Fazer o tour · {steps} passos
    </Button>
  );
}

export function ShortcutsButton() {
  return (
    <Button variant="ghost" onClick={() => openShortcuts()}>
      <Keyboard /> Atalhos de teclado
    </Button>
  );
}
