/** Cookie the desktop shell sets on its own window; see src/server/desktop.ts. */
export const DESKTOP_COOKIE = "wp_desktop";

/** Where a desktop window without a session gets one (src/app/api/desktop/session). */
export const DESKTOP_SESSION_PATH = "/api/desktop/session";

/** Constant-time string comparison that works in any runtime (the proxy has no node:crypto guarantee). */
export function sameSecret(given: string | undefined, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
