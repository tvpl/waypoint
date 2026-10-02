"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent);
}

/** True on Apple platforms (⌘ shortcuts); false elsewhere and while server-rendering. */
export function useIsMac(): boolean {
  return useSyncExternalStore(noop, isMacPlatform, () => false);
}

/** "⌘⇧Z" → "Ctrl+Shift+Z" outside Apple platforms. Separators like " · " are kept. */
export function formatKeys(keys: string, mac: boolean): string {
  if (mac) return keys;
  return keys.replace(/[⌘⇧⌥]+(?:\S)/g, (combo) => {
    const mods = combo.slice(0, -1);
    const key = combo.slice(-1);
    const names = [...mods].map((m) => (m === "⌘" ? "Ctrl" : m === "⇧" ? "Shift" : "Alt"));
    // Windows convention: Ctrl before Shift/Alt.
    names.sort((a, b) => (a === "Ctrl" ? -1 : b === "Ctrl" ? 1 : 0));
    return [...names, key === "↵" ? "Enter" : key].join("+");
  });
}

/** Renders a shortcut string for the current platform. */
export function useKeys(keys: string): string {
  return formatKeys(keys, useIsMac());
}
