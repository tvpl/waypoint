"use client";
import { useTransition } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { SiteIcon } from "@/components/ui/misc";
import { createWorkspaceAction, switchWorkspaceAction } from "./actions";
import { ask } from "@/components/ui/ask";

export function WorkspaceSwitcher({ current, workspaces }: { current: { id: string; name: string }; workspaces: { id: string; name: string; role: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="inline-flex h-[30px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-body text-ink-2 hover:bg-surface-2"
        >
          <SiteIcon label={current.name} size={18} />
          <span>{current.name}</span>
          <ChevronDown className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => start(() => switchWorkspaceAction(w.id))}>
            <SiteIcon label={w.name} size={18} />
            <span className="flex-1">{w.name}</span>
            {w.id === current.id && <Check />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            const name = await ask.prompt({ title: "Novo workspace", label: "Nome", placeholder: "Ex.: Time de produto", confirmLabel: "Criar" });
            if (name) start(() => createWorkspaceAction(name));
          }}
        >
          <Plus /> Novo workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
