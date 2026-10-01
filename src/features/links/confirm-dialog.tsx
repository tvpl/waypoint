"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";

export type ConfirmRequest = {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  run: () => Promise<void> | void;
};

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && !busy && onClose()}>
      {request && (
        <DialogContent title={request.title} className="max-w-[440px]">
          <DialogBody>
            <div className="text-sm leading-6 text-ink-2">{request.description}</div>
          </DialogBody>
          <DialogFooter className="justify-end">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant={request.danger ? "danger" : "primary"}
              disabled={busy}
              autoFocus
              onClick={async () => {
                setBusy(true);
                try {
                  await request.run();
                } finally {
                  setBusy(false);
                  onClose();
                }
              }}
            >
              {request.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
