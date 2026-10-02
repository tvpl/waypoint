"use client";
import { useSyncExternalStore } from "react";

export type ThemePref = "light" | "dark" | "system";

const KEY = "wp-theme";
const CHANGE_EVENT = "wp:theme";
const THEME_COLOR = { light: "#f5f5f2", dark: "#0e0f12" } as const;

export function getThemePref(): ThemePref {
  try {
    return (localStorage.getItem(KEY) as ThemePref) || "system";
  } catch {
    return "system";
  }
}

const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

/** Puts the resolved theme on <html> and on the browser chrome (theme-color). */
function paint(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = dark ? THEME_COLOR.dark : THEME_COLOR.light;
}

export function applyTheme(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {}
  paint(pref);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function cycleTheme(): ThemePref {
  const order: ThemePref[] = ["light", "dark", "system"];
  const next = order[(order.indexOf(getThemePref()) + 1) % order.length];
  applyTheme(next);
  return next;
}

export const THEME_LABEL: Record<ThemePref, string> = { light: "Claro", dark: "Escuro", system: "Sistema" };

let watching = false;
/** Follows OS theme changes while the preference is "system" and other tabs' changes. Idempotent. */
function watch() {
  if (watching) return;
  watching = true;
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getThemePref() === "system") paint("system");
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    paint(getThemePref());
    window.dispatchEvent(new Event(CHANGE_EVENT));
  });
}

function subscribe(cb: () => void) {
  watch();
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

/** Current theme preference, kept in sync across every component (and tabs). */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, getThemePref, () => "system");
}

/** Other components can open the global palette with this event. */
export const OPEN_PALETTE_EVENT = "wp:open-palette";
export function openPalette(query?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT, { detail: { query } }));
}
