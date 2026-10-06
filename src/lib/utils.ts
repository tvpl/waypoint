import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { customAlphabet } from "nanoid";

/**
 * tailwind-merge only knows Tailwind's default scale: teach it the design tokens from
 * globals.css, or e.g. `text-caption` would be taken for a color and dropped next to
 * `text-muted`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "caption", "body", "lead", "title", "display-sm", "display", "display-lg"],
      radius: ["chip", "control", "card", "panel"],
      shadow: ["rest", "thumb", "raise", "float", "pop"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
/** Short, URL-safe, lowercase ids. */
export const newId = customAlphabet(alphabet, 16);
export const newToken = customAlphabet(alphabet + "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 32);

export function slugify(input: string): string {
  return (
    input
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "plan"
  );
}

export function normalizeTag(input: string): string {
  return input
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .slice(0, 48);
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Relative time in pt-BR ("há 2 h", "ontem", "3 dias"). */
export function timeAgo(date: Date | number | null | undefined, now = Date.now()): string {
  if (date == null) return "";
  const t = typeof date === "number" ? date : date.getTime();
  const s = Math.round((now - t) / 1000);
  if (s < 60) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: d > 300 ? "numeric" : undefined }).format(t);
}

export function formatDateTime(date: Date | number): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

/** True when the user asked for less motion, in the OS or in Configurações (always false on the server). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.classList.contains("wp-reduce-motion") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Animation length in ms, or 0 when the user prefers reduced motion. For JS-driven animations CSS can't reach. */
export function motionMs(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}

/** `scrollIntoView` behavior that respects reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
