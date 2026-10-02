"use client";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "./utils";

/**
 * FLIP: when the children marked `data-flip="<id>"` move after a render (an item was
 * archived, reordered or filtered out), they glide from their old spot instead of jumping.
 * `layoutKey` changes (e.g. switching cards → list) reset the memory without animating.
 */
export function useFlip(container: RefObject<HTMLElement | null>, deps: unknown, layoutKey: string) {
  const prev = useRef<{ key: string; pos: Map<string, { x: number; y: number }> }>({ key: layoutKey, pos: new Map() });
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    const items = root.querySelectorAll<HTMLElement>("[data-flip]");
    const next = new Map<string, { x: number; y: number }>();
    const animate = prev.current.key === layoutKey && !prefersReducedMotion() && items.length <= 240;
    items.forEach((el) => {
      const r = el.getBoundingClientRect();
      const at = { x: r.left - base.left, y: r.top - base.top };
      next.set(el.dataset.flip!, at);
      const was = prev.current.pos.get(el.dataset.flip!);
      if (!animate || !was) return;
      const dx = was.x - at.x;
      const dy = was.y - at.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 320,
        easing: "cubic-bezier(.2,.8,.2,1)",
      });
    });
    prev.current = { key: layoutKey, pos: next };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, layoutKey]);
}
