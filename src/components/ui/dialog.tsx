"use client";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  hideClose,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: React.ReactNode; description?: React.ReactNode; hideClose?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-[wp-in_120ms_ease-out]" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[6vh] z-50 flex max-h-[88vh] w-[calc(100vw-32px)] max-w-[640px] -translate-x-1/2 flex-col overflow-hidden rounded-[18px] bg-surface text-ink shadow-pop outline-none data-[state=open]:animate-in",
          className,
        )}
        {...props}
      >
        <div className="flex items-start gap-3 px-6 pb-2 pt-5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <D.Title className="text-[17px] font-semibold">{title}</D.Title>
            {description ? <D.Description className="text-[13px] text-muted">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : ""}</D.Description>}
          </div>
          {!hideClose && (
            <D.Close className="-mr-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover" aria-label="Fechar">
              <X className="size-[18px]" />
            </D.Close>
          )}
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("scrollbar-thin flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pb-5 pt-2", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2.5 border-t border-line bg-surface-2 px-6 py-3.5", className)} {...props} />;
}
