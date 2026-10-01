"use client";
/**
 * Presentation mode ("Apresentar"): a clean full-window stage with the plan
 * and a minimal bottom bar. Each step animates the viewport to an element and
 * dims the rest; step 0 is the overview.
 *
 * Fullscreen uses the Fullscreen API on the document (so dialogs portaled to
 * <body> stay visible); when unavailable or refused (e.g. opened from
 * ?present=1 without a user gesture) the fixed overlay is the fallback.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getViewportForBounds, useReactFlow, useStore, type Rect } from "@xyflow/react";
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from "lucide-react";
import type { PlanDocument } from "@/domain/plan";
import { cn } from "@/lib/utils";
import { childrenMap } from "./doc-ops";
import { PlanCanvasView } from "./viewer";
import { activeIdsFor, presentationSteps, type PresentationStep } from "./presentation-steps";
import type { ResolvedResource } from "./resource-types";

const IDLE_MS = 2600;
const ANIM_MS = 600;

const fsSupported = () => typeof document !== "undefined" && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;

export function PresentationMode({
  title,
  document: doc,
  resources,
  onExit,
}: {
  title: string;
  document: PlanDocument;
  resources: Record<string, ResolvedResource>;
  onExit: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const steps = useMemo(() => presentationSteps(doc, title), [doc, title]);
  const kids = useMemo(() => childrenMap(doc), [doc]);
  const [index, setIndex] = useState(0);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // decided after mount (the server can't know) to keep hydration stable
  const [canFs, setCanFs] = useState(false);
  const ourFsChange = useRef(false);
  const step = steps[Math.min(index, steps.length - 1)];
  const active = useMemo(() => activeIdsFor(doc, step.nodeId, kids), [doc, step.nodeId, kids]);
  const last = steps.length - 1;

  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(last, i))), [last]);
  const next = useCallback(() => setIndex((i) => Math.min(last, i + 1)), [last]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const exit = useCallback(() => {
    if (document.fullscreenElement) {
      ourFsChange.current = true;
      void document.exitFullscreen().catch(() => {});
    }
    onExit();
  }, [onExit]);

  const toggleFullscreen = useCallback(() => {
    if (!fsSupported()) return;
    ourFsChange.current = true;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => (ourFsChange.current = false));
  }, []);

  // enter: try fullscreen (needs a user gesture — fine to fail), focus the stage
  useEffect(() => {
    setCanFs(fsSupported());
    stageRef.current?.focus();
    const gesture = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? true;
    if (fsSupported() && gesture && !document.fullscreenElement) {
      ourFsChange.current = true;
      document.documentElement.requestFullscreen().catch(() => (ourFsChange.current = false));
    }
    const onFs = () => {
      const on = !!document.fullscreenElement;
      setFullscreen(on);
      // leaving fullscreen with the browser's own Esc ends the presentation
      if (!on && !ourFsChange.current) onExit();
      ourFsChange.current = false;
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [onExit]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const dialog = t?.closest?.('[role="dialog"]');
      if (dialog && dialog !== stageRef.current) return; // preview modal, hover card…
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
          return run(next);
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          return run(prev);
        case "Home":
          return run(() => go(0));
        case "End":
          return run(() => go(last));
        case "Escape":
          return run(exit);
        case "f":
        case "F":
          return run(toggleFullscreen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, go, last, exit, toggleFullscreen]);

  // idle: fade the bar and the cursor
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), IDLE_MS);
    };
    wake();
    const evs = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel"] as const;
    evs.forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
    return () => {
      clearTimeout(t);
      evs.forEach((ev) => window.removeEventListener(ev, wake));
    };
  }, []);

  // swipe left/right (one finger, mostly horizontal, quick)
  const swipe = useRef<{ x: number; y: number; t: number; multi: boolean } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      if (swipe.current) swipe.current.multi = true;
      return;
    }
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), multi: false };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipe.current;
    if (!s || e.touches.length > 0) return;
    swipe.current = null;
    if (s.multi) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - s.x;
    const dy = p.clientY - s.y;
    if (Date.now() - s.t > 700 || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) next();
    else prev();
  };

  return (
    <div
      ref={stageRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Apresentação: ${title}`}
      tabIndex={-1}
      data-idle={idle || undefined}
      className={cn("wp-presentation fixed inset-0 z-40 flex flex-col bg-surface-2 text-ink outline-none", idle && "cursor-none")}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative min-h-0 flex-1">
        <PlanCanvasView document={doc} resources={resources} stage={{ activeIds: active }} meta={{ title }}>
          <StageCamera step={step} />
        </PlanCanvasView>
      </div>

      <div aria-live="polite" className="sr-only">
        {`Passo ${index + 1} de ${steps.length}: ${step.title}`}
      </div>

      <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-[max(16px,env(safe-area-inset-bottom))] transition-opacity duration-500", idle && "opacity-0")}>
        <div
          role="toolbar"
          aria-label="Controles da apresentação"
          className="pointer-events-auto flex max-w-[calc(100vw-24px)] items-center gap-1 rounded-2xl border border-line bg-surface/95 p-1.5 shadow-pop backdrop-blur-sm focus-within:opacity-100"
        >
          <BarButton label="Anterior (←)" onClick={prev} disabled={index === 0}>
            <ChevronLeft />
          </BarButton>
          <div className="flex min-w-0 max-w-[min(52vw,420px)] flex-col items-center px-2 leading-tight">
            <span className="w-full truncate text-center text-[13px] font-semibold">{step.title}</span>
            <span className="font-mono text-[11px] text-muted">
              {index + 1} / {steps.length}
            </span>
          </div>
          <BarButton label="Próximo (→)" onClick={next} disabled={index === last}>
            <ChevronRight />
          </BarButton>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {canFs && (
            <BarButton label={fullscreen ? "Sair da tela cheia (F)" : "Tela cheia (F)"} onClick={toggleFullscreen} pressed={fullscreen}>
              {fullscreen ? <Minimize /> : <Maximize />}
            </BarButton>
          )}
          <BarButton label="Sair da apresentação (Esc)" onClick={exit}>
            <X />
          </BarButton>
        </div>
        <div className="h-[3px] w-[min(320px,60vw)] overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${steps.length > 1 ? (index / last) * 100 : 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function BarButton({ label, onClick, disabled, pressed, children }: { label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent [&_svg]:size-[18px]"
    >
      {children}
    </button>
  );
}

/** Moves the viewport to the current step (inside the React Flow provider). */
function StageCamera({ step }: { step: PresentationStep }) {
  const rf = useReactFlow();
  // every visible node measured (useNodesInitialized stays false for read-only nodes without handle bounds)
  const ready = useStore((s) => {
    if (!s.nodeLookup.size) return false;
    for (const n of s.nodeLookup.values()) if (!n.hidden && !n.measured.width) return false;
    return true;
  });
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const first = useRef(true);

  useEffect(() => {
    if (!ready || !width || !height) return;
    let bounds: Rect | null = null;
    let maxZoom = 1.5;
    let padding = 0.14;
    if (step.nodeId) {
      const n = rf.getInternalNode(step.nodeId);
      if (n && !n.hidden) {
        bounds = { x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, width: n.measured.width ?? n.width ?? 0, height: n.measured.height ?? n.height ?? 0 };
        // small elements shouldn't fill the screen
        if (bounds.width * bounds.height < 60_000) padding = 0.3;
      }
    }
    if (!bounds) {
      const visible = rf.getNodes().filter((n) => !n.hidden);
      if (!visible.length) return;
      bounds = rf.getNodesBounds(visible);
      maxZoom = 1;
      padding = 0.1;
    }
    // leave room for the bottom bar
    const vp = getViewportForBounds(bounds, width, height - 72, 0.1, maxZoom, padding);
    void rf.setViewport({ ...vp, y: vp.y }, { duration: first.current ? 0 : ANIM_MS });
    first.current = false;
  }, [step.nodeId, ready, width, height, rf]);

  return null;
}
