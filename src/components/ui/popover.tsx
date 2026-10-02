"use client";
import * as React from "react";
import { Popover as P, Tooltip as T } from "radix-ui";
import { cn } from "@/lib/utils";
import { formatKeys, useIsMac } from "@/lib/platform";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export function PopoverContent({ className, sideOffset = 8, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        className={cn("z-50 w-72 rounded-card border border-line bg-surface p-4 text-ink shadow-pop outline-none wp-float", className)}
        {...props}
      />
    </P.Portal>
  );
}

export const TooltipProvider = T.Provider;

export function Tooltip({ content, children, side = "bottom" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  const mac = useIsMac();
  if (typeof content === "string") content = formatKeys(content, mac);
  return (
    <T.Root delayDuration={350}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-[60] rounded-md bg-ink px-2 py-1 text-xs font-medium text-bg shadow-pop wp-float">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
