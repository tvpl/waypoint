import type { CSSProperties } from "react";
import { luminance, TINT_INK } from "@/lib/color";

function parse(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = parse(a);
  const cb = parse(b);
  const out = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export type NodeTone = {
  /** Light tint (fills, tiles). */
  soft: string;
  /** Saturated ink paired with the tint (text, icons, borders). */
  ink: string;
  /** The chosen color is dark: blocks get a solid fill with white text. */
  dark: boolean;
  fill: string;
};

/**
 * Derives a tint/ink pair from any node color. "Neutro"/unset returns null so
 * the node follows the theme tokens instead.
 */
export function nodeTone(color?: string | null): NodeTone | null {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color) || color.toUpperCase() === "#FFFFFF") return null;
  const c = color.toUpperCase();
  if (luminance(c) < 0.4) return { soft: mixHex(c, "#FFFFFF", 0.84), ink: c, dark: true, fill: c };
  return { soft: c, ink: TINT_INK[c] ?? mixHex(c, "#17171C", 0.62), dark: false, fill: c };
}

/** CSS custom properties consumed by planner.css (.wp-tile, .wp-area, .wp-text…). */
export function toneVars(tone: NodeTone | null): CSSProperties | undefined {
  if (!tone) return undefined;
  return { ["--tint" as string]: tone.soft, ["--tint-ink" as string]: tone.ink } as CSSProperties;
}
