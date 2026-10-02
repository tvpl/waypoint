"use client";
import { PREF_VIEW_COOKIE } from "./view-cookie";
/** Per-viewer UI preferences kept in localStorage (always guarded). */

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

export function getPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = read(key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
export const setPref = write;

export function getJson<T>(key: string, fallback: T): T {
  const v = read(key);
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}
export const setJson = (key: string, value: unknown) => write(key, JSON.stringify(value));

export const PREF_VIEW = "wp-links-view";

/** The library view lives in a cookie so the server renders it directly (no flash of the default). */
export function setViewCookie(view: string) {
  try {
    document.cookie = `${PREF_VIEW_COOKIE}=${encodeURIComponent(view)}; path=/; max-age=31536000; samesite=lax`;
  } catch {}
}
export const PREF_SUMMARY = "wp-links-summary";
export const PREF_EXPANDED = "wp-links-expanded";
export const PREF_PREVIEW_MODE = "wp-links-preview-mode";
export const PREF_NEWTAB_DOMAINS = "wp-links-newtab-domains";

export function alwaysNewTab(domain: string): boolean {
  return getJson<string[]>(PREF_NEWTAB_DOMAINS, []).includes(domain);
}
export function setAlwaysNewTab(domain: string, on: boolean) {
  const list = new Set(getJson<string[]>(PREF_NEWTAB_DOMAINS, []));
  if (on) list.add(domain);
  else list.delete(domain);
  setJson(PREF_NEWTAB_DOMAINS, [...list]);
}
