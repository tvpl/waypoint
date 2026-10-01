"use client";
import * as React from "react";
import { ExternalLink, PanelRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/menu";
import { alwaysNewTab } from "./prefs";
import type { LinkItem } from "./types";

type OpenTarget = Pick<LinkItem, "id" | "url" | "domain" | "openBehavior" | "title">;

type Ctx = {
  /** onClick handler for real `<a href target=_blank>` elements: honors openBehavior. */
  onLinkClick: (e: React.MouseEvent, link: OpenTarget) => void;
  /** onAuxClick: middle-click opens natively in a new tab; we only record it. */
  onLinkAuxClick: (e: React.MouseEvent, link: OpenTarget) => void;
  openInApp: (link: OpenTarget) => void;
  openNewTab: (link: OpenTarget) => void;
};

const OpenerContext = React.createContext<Ctx | null>(null);

export function recordOpen(id: string) {
  fetch(`/api/links/${id}/open`, { method: "POST", keepalive: true }).catch(() => {});
}

export function LinkOpenerProvider({ children, onPreview }: { children: React.ReactNode; onPreview: (id: string) => void }) {
  const [ask, setAsk] = React.useState<{ link: OpenTarget; x: number; y: number } | null>(null);

  const openInApp = React.useCallback(
    (link: OpenTarget) => {
      recordOpen(link.id);
      onPreview(link.id);
    },
    [onPreview],
  );
  const openNewTab = React.useCallback((link: OpenTarget) => {
    recordOpen(link.id);
    window.open(link.url, "_blank", "noopener,noreferrer");
  }, []);

  const value = React.useMemo<Ctx>(
    () => ({
      onLinkClick(e, link) {
        // Modifier clicks keep the browser's native behavior (new tab / window).
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
          recordOpen(link.id);
          return;
        }
        const behavior = alwaysNewTab(link.domain) ? "new_tab" : link.openBehavior;
        if (behavior === "new_tab") {
          recordOpen(link.id); // the anchor itself opens the new tab
          return;
        }
        e.preventDefault();
        if (behavior === "preview") openInApp(link);
        else setAsk({ link, x: e.clientX, y: e.clientY });
      },
      onLinkAuxClick(e, link) {
        if (e.button === 1) recordOpen(link.id);
      },
      openInApp,
      openNewTab,
    }),
    [openInApp, openNewTab],
  );

  return (
    <OpenerContext.Provider value={value}>
      {children}
      <DropdownMenu open={!!ask} onOpenChange={(o) => !o && setAsk(null)}>
        <DropdownMenuTrigger asChild>
          <span aria-hidden className="pointer-events-none fixed h-px w-px" style={{ left: ask?.x ?? 0, top: ask?.y ?? 0 }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px]">
          <DropdownMenuLabel className="max-w-[260px] truncate normal-case tracking-normal">{ask?.link.title}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => ask && openNewTab(ask.link)}>
            <ExternalLink />
            Abrir em nova aba
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ask && openInApp(ask.link)}>
            <PanelRight />
            Abrir no app
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </OpenerContext.Provider>
  );
}

export function useLinkOpener(): Ctx {
  const ctx = React.useContext(OpenerContext);
  if (!ctx) throw new Error("useLinkOpener must be used inside LinkOpenerProvider");
  return ctx;
}
