"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { helpModuleFor } from "./guides";
import { startTour, TOUR_EVENT } from "./events";
import { tourSeen } from "./tour";

const key = (id: string) => `wp-tour-invite:${id}`;

function dismissed(id: string) {
  try {
    return localStorage.getItem(key(id)) === "dismissed";
  } catch {
    // No storage (private window, blocked site data): don't nag on every visit.
    return true;
  }
}

function dismiss(id: string) {
  try {
    localStorage.setItem(key(id), "dismissed");
  } catch {}
}

/**
 * A small card in the bottom-left corner offering the module's guided tour the first time someone
 * opens a module that has one. "Fazer o tour" or "Agora não" (or finishing the tour from elsewhere)
 * puts it away for good. Never shown to automated browsers (Playwright e2e): a floating card could
 * intercept their clicks.
 */
export function TourInvite({ placement = "rail" }: { placement?: "rail" | "canvas" }) {
  const pathname = usePathname();
  const [invite, setInvite] = React.useState<{ id: string; title: string } | null>(null);
  const [animate, setAnimate] = React.useState(false);

  React.useEffect(() => {
    setInvite(null);
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    const m = helpModuleFor(pathname);
    if (!m || !m.tour.length || tourSeen(m.id) || dismissed(m.id)) return;
    // A tour is about to start from a link (?tour=…): no invite on top of it.
    if (new URLSearchParams(window.location.search).has("tour")) return;
    // Let the page settle first, so the card doesn't flash during quick navigation.
    const timer = setTimeout(() => {
      if (tourSeen(m.id) || dismissed(m.id)) return;
      setAnimate(!prefersReducedMotion());
      setInvite({ id: m.id, title: m.title });
    }, 1500);
    return () => clearTimeout(timer);
  }, [pathname]);

  // A tour started some other way (Ajuda, ⌘K) answers the invite too.
  React.useEffect(() => {
    if (!invite) return;
    const onStart = (e: Event) => {
      dismiss(String((e as CustomEvent).detail));
      setInvite(null);
    };
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, [invite]);

  if (!invite) return null;
  const close = () => {
    dismiss(invite.id);
    setInvite(null);
  };
  return (
    <aside
      aria-label={`Tour de ${invite.title}`}
      className={cn(
        "fixed z-40 w-[min(300px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-3.5 text-ink shadow-pop",
        // The editor keeps its tools at the bottom and on the left: the invite sits under the top bar.
        placement === "canvas"
          ? "right-3 top-[calc(var(--titlebar-h,0px)+64px)]"
          : "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 sm:bottom-4 sm:left-[92px]",
        animate && "animate-in",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink" aria-hidden>
          <PlayCircle className="size-[18px]" strokeWidth={1.9} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-body font-semibold">Primeira vez em {invite.title}?</p>
          <p className="text-caption leading-4 text-muted">Um tour rápido mostra onde fica cada coisa. Leva menos de um minuto.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={close} className="inline-flex h-8 items-center rounded-lg px-3 text-body font-medium text-ink-2 hover:bg-hover hover:text-ink">
          Agora não
        </button>
        <button
          type="button"
          onClick={() => {
            const id = invite.id;
            close();
            startTour(id);
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-body font-medium text-white transition-colors hover:bg-accent/90"
        >
          <PlayCircle className="size-3.5" /> Fazer o tour
        </button>
      </div>
    </aside>
  );
}
