"use client";
export type ThemePref = "light" | "dark" | "system";

export function getThemePref(): ThemePref {
  try {
    return (localStorage.getItem("wp-theme") as ThemePref) || "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePref) {
  try {
    localStorage.setItem("wp-theme", pref);
  } catch {}
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function cycleTheme(): ThemePref {
  const order: ThemePref[] = ["light", "dark", "system"];
  const next = order[(order.indexOf(getThemePref()) + 1) % order.length];
  applyTheme(next);
  return next;
}

/** Other components can open the global palette with this event. */
export const OPEN_PALETTE_EVENT = "wp:open-palette";
export function openPalette(query?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT, { detail: { query } }));
}
