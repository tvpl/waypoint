"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { overlayOpen } from "@/lib/dom";
import { TOUR_EVENT } from "./events";
import { helpModule } from "./guides";
import type { HelpModule } from "./types";

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;
const CARD_W = 340;

/** First visible element carrying the tour target. */
function findTarget(target?: string): HTMLElement | null {
  if (!target) return null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

const rectOf = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect();
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
};

export const tourSeen = (id: string) => {
  try {
    return localStorage.getItem(`wp-tour:${id}`) === "done";
  } catch {
    return false;
  }
};

/**
 * Guided tours: a spotlight on each step's element with a small card. Started by `startTour(id)`
 * or `?tour=<id>`; navigates to the module first when needed. Arrow keys move, Esc closes.
 */
export function TourHost() {
  const router = useRouter();
  const pathname = usePathname();
  const [tour, setTour] = React.useState<HelpModule | null>(null);
  const [index, setIndex] = React.useState(0);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [viewport, setViewport] = React.useState({ w: 0, h: 0 });
  const [searching, setSearching] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const targetRef = React.useRef<HTMLElement | null>(null);

  const begin = React.useCallback(
    (id: string) => {
      const m = helpModule(id);
      if (!m || !m.tour.length) return;
      if (!m.match.test(window.location.pathname)) {
        if (m.href) router.push(`${m.href}${m.href.includes("?") ? "&" : "?"}tour=${m.id}`);
        else toast.info(m.id === "editor" ? "Abra um plan para fazer o tour do editor." : `Abra ${m.title} para fazer este tour.`);
        return;
      }
      setIndex(0);
      setTour(m);
    },
    [router],
  );

  React.useEffect(() => {
    const onStart = (e: Event) => begin(String((e as CustomEvent).detail));
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, [begin]);

  // ?tour=<id> (help center links, navigation from another page).
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("tour");
    if (!id) return;
    url.searchParams.delete("tour");
    window.history.replaceState(window.history.state, "", url);
    const timer = setTimeout(() => begin(id), 350);
    return () => clearTimeout(timer);
  }, [pathname, begin]);

  const close = React.useCallback((finished = false) => {
    setTour((t) => {
      if (t) {
        try {
          localStorage.setItem(`wp-tour:${t.id}`, "done");
        } catch {}
        if (finished)
          toast.success(`Tour de ${t.title} concluído.`, {
            action: { label: "Central de ajuda", onClick: () => (window.location.href = `/help/${t.id}`) },
          });
      }
      return null;
    });
    setRect(null);
    targetRef.current = null;
  }, []);

  const step = tour?.tour[index];

  // Locate the step's element (waiting a little for pages that are still rendering).
  React.useEffect(() => {
    if (!step) return;
    let cancelled = false;
    let tries = 0;
    setSearching(true);
    const locate = () => {
      if (cancelled) return;
      const el = findTarget(step.target);
      if (!el && step.target && tries++ < 12) return void setTimeout(locate, 100);
      targetRef.current = el;
      setSearching(false);
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      if (r.top < 64 || r.bottom > window.innerHeight - 64) el.scrollIntoView({ block: "center", behavior: "smooth" });
      setRect(rectOf(el));
    };
    locate();
    return () => {
      cancelled = true;
    };
  }, [step]);

  // Follow the element while the page scrolls, resizes or animates.
  React.useEffect(() => {
    if (!tour) return;
    let frame = 0;
    const update = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      const el = targetRef.current;
      if (el && el.isConnected) {
        const next = rectOf(el);
        setRect((prev) => (prev && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5 ? prev : next));
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [tour]);

  // Close when leaving the module's page.
  React.useEffect(() => {
    if (tour && !tour.match.test(pathname)) close();
  }, [pathname, tour, close]);

  React.useEffect(() => {
    if (!tour) return;
    const key = (e: KeyboardEvent) => {
      if (overlayOpen() && !cardRef.current?.contains(document.activeElement)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight" || (e.key === "Enter" && document.activeElement === cardRef.current)) {
        e.preventDefault();
        if (index < tour.tour.length - 1) setIndex(index + 1);
        else close(true);
      } else if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        setIndex(index - 1);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [tour, index, close]);

  React.useEffect(() => {
    if (step && !searching) cardRef.current?.focus({ preventScroll: true });
  }, [step, searching]);

  if (!tour || !step) return null;
  const last = index === tour.tour.length - 1;
  const phone = viewport.w > 0 && viewport.w < 640;

  // Card placement: below the spotlight, above when there's no room, centered without a target.
  let style: React.CSSProperties;
  if (phone) style = { left: 12, right: 12, bottom: "calc(80px + env(safe-area-inset-bottom))" };
  else if (!rect) style = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: CARD_W + 40 };
  else {
    const width = Math.min(CARD_W, viewport.w - 24);
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), viewport.w - width - 12);
    const below = rect.top + rect.height + 12;
    const spaceBelow = viewport.h - below;
    if (spaceBelow > 220) style = { left, top: below, width };
    else if (rect.top > 232) style = { left, top: rect.top - 12, width, transform: "translateY(-100%)" };
    else {
      // Tall element: beside it.
      const right = rect.left + rect.width + 12;
      style = right + width < viewport.w - 12 ? { left: right, top: Math.max(12, Math.min(rect.top, viewport.h - 260)), width } : { left, bottom: 16, width };
    }
  }

  return createPortal(
    <div className="wp-tour fixed inset-0 z-[70]" aria-live="polite">
      {/* Blocks clicks on the page while the tour runs; the spotlight dims everything else. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {rect ? (
        <div
          aria-hidden
          className="wp-tour-spotlight pointer-events-none fixed rounded-[14px]"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 bg-scrim animate-fade-in" />
      )}
      <div
        ref={cardRef}
        key={index}
        role="dialog"
        aria-modal="false"
        aria-labelledby="wp-tour-title"
        aria-describedby="wp-tour-body"
        tabIndex={-1}
        style={style}
        className={cn("fixed flex flex-col gap-3 rounded-card border border-line bg-surface p-4 text-ink shadow-pop outline-none animate-in", searching && "opacity-0")}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink [&_svg]:size-4">
            <tour.icon />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-micro font-semibold uppercase tracking-[.08em] text-accent-ink">
              {tour.title} · {index + 1} de {tour.tour.length}
            </span>
            <h2 id="wp-tour-title" className="text-lead font-semibold leading-snug">
              {step.title}
            </h2>
          </div>
          <button type="button" onClick={() => close()} aria-label="Fechar o tour" className="-mr-1 -mt-1 rounded-md p-1 text-muted hover:bg-hover hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <p id="wp-tour-body" className="text-body leading-5 text-ink-2">
          {step.body}
        </p>
        <div className="flex items-center gap-2 pt-1">
          <div className="mr-auto flex gap-1" aria-hidden>
            {tour.tour.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all duration-300", i === index ? "w-4 bg-accent" : i < index ? "w-1.5 bg-accent/50" : "w-1.5 bg-line-2")} />
            ))}
          </div>
          {index > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setIndex(index - 1)}>
              <ArrowLeft /> Voltar
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => close()}>
              Pular
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => (last ? close(true) : setIndex(index + 1))}>
            {last ? (
              <>
                <Check /> Concluir
              </>
            ) : (
              <>
                Próximo <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
