"use client";
import * as React from "react";
import { DropdownMenu as DM, ContextMenu as CM } from "radix-ui";
import { cn } from "@/lib/utils";
import { useKeys } from "@/lib/platform";

const content =
  "z-50 min-w-[200px] overflow-hidden rounded-xl border border-line bg-surface p-1.5 text-ink shadow-pop wp-float";
const item =
  "relative flex h-8 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-body outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent-ink [&_svg]:size-[15px] [&_svg]:shrink-0";

function Shortcut({ keys }: { keys: string }) {
  return <span className="ml-auto pl-4 font-mono text-caption text-muted">{useKeys(keys)}</span>;
}

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuSub = DM.Sub;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content sideOffset={sideOffset} className={cn(content, className)} {...props} />
    </DM.Portal>
  );
}

export function DropdownMenuItem({ className, danger, shortcut, children, ...props }: React.ComponentProps<typeof DM.Item> & { danger?: boolean; shortcut?: string }) {
  return (
    <DM.Item className={cn(item, danger && "text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger", className)} {...props}>
      {children}
      {shortcut && <Shortcut keys={shortcut} />}
    </DM.Item>
  );
}

export function DropdownMenuSeparator() {
  return <DM.Separator className="mx-1.5 my-1 h-px bg-line" />;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2.5 pb-1 pt-1.5 text-caption font-semibold uppercase tracking-[.06em] text-muted", className)} {...props} />;
}

export function DropdownMenuSubTrigger({ className, ...props }: React.ComponentProps<typeof DM.SubTrigger>) {
  return <DM.SubTrigger className={cn(item, "data-[state=open]:bg-hover", className)} {...props} />;
}

export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof DM.SubContent>) {
  return (
    <DM.Portal>
      <DM.SubContent className={cn(content, className)} {...props} />
    </DM.Portal>
  );
}

export const ContextMenu = CM.Root;
export const ContextMenuTrigger = CM.Trigger;

export function ContextMenuContent({ className, ...props }: React.ComponentProps<typeof CM.Content>) {
  return (
    <CM.Portal>
      <CM.Content className={cn(content, "min-w-[232px]", className)} {...props} />
    </CM.Portal>
  );
}

export function ContextMenuItem({ className, danger, shortcut, children, ...props }: React.ComponentProps<typeof CM.Item> & { danger?: boolean; shortcut?: string }) {
  return (
    <CM.Item className={cn(item, danger && "text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger", className)} {...props}>
      {children}
      {shortcut && <Shortcut keys={shortcut} />}
    </CM.Item>
  );
}

export function ContextMenuSeparator() {
  return <CM.Separator className="mx-1.5 my-1 h-px bg-line" />;
}

export const ContextMenuSub = CM.Sub;

export function ContextMenuSubTrigger({ className, ...props }: React.ComponentProps<typeof CM.SubTrigger>) {
  return <CM.SubTrigger className={cn(item, "data-[state=open]:bg-hover", className)} {...props} />;
}

export function ContextMenuSubContent({ className, ...props }: React.ComponentProps<typeof CM.SubContent>) {
  return (
    <CM.Portal>
      <CM.SubContent className={cn(content, className)} {...props} />
    </CM.Portal>
  );
}
