"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPlanAction } from "@/app/(app)/plans/actions";
import { lockNowAction } from "@/app/(app)/settings/desktop-actions";
import { acceleratorsOf, getDesktop, matchesAccelerator, TOGGLE_RAIL_EVENT } from "@/lib/desktop";
import { applyTheme, openPalette, useThemePref } from "@/lib/theme";
import { pastedUrl } from "@/lib/url";
import { openShortcuts } from "./shortcuts";
import type { DesktopSecurity } from "@/server/desktop-security";

const GO: Record<string, string> = {
  "app:go-home": "/",
  "app:go-plans": "/plans",
  "app:go-links": "/links",
  "app:go-tags": "/tags",
  "app:go-tasks": "/tasks",
  "app:go-settings": "/settings",
  "app:add-link": "/links?add=1",
  "app:new-collection": "/links?newCollection=1",
  "app:import": "/links/import",
  "app:extension": "/settings?tab=integracoes",
  "app:security": "/settings?tab=aplicativo#seguranca",
  "app:backups": "/settings?tab=backup#backups",
};

/** Ends the session and shows the lock screen; without the app lock, says where to turn it on. */
export async function lockNow(router?: { push(href: string): void }) {
  const res = await lockNowAction().catch(() => ({ ok: false as const, error: "Não foi possível bloquear." }));
  if (!res.ok) {
    toast(res.error, router ? { action: { label: "Configurar", onClick: () => router.push("/settings?tab=aplicativo#seguranca") } } : undefined);
    return;
  }
  window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
}

/**
 * Runs a desktop menu command. "app:" commands act on the page (navigation, dialogs, theme);
 * anything else goes to the desktop shell (window, zoom, backup…).
 */
export function useDesktopCommand() {
  const router = useRouter();
  const pathname = usePathname();
  const busy = React.useRef(false);

  return React.useCallback(
    async (id: string, arg?: string) => {
      if (!id.startsWith("app:")) return getDesktop()?.run(id);
      if (id === "app:navigate") return arg?.startsWith("/") && !arg.startsWith("//") ? router.push(arg) : undefined;
      if (GO[id]) return router.push(GO[id]);
      switch (id) {
        case "app:palette":
          return openPalette();
        case "app:lock":
          return lockNow(router);
        case "app:shortcuts":
          return openShortcuts();
        case "app:toggle-rail":
          return window.dispatchEvent(new Event(TOGGLE_RAIL_EVENT));
        case "app:theme-light":
          return applyTheme("light");
        case "app:theme-dark":
          return applyTheme("dark");
        case "app:theme-system":
          return applyTheme("system");
        case "app:export-html":
        case "app:export-csv":
        case "app:export-json":
          // The shell turns the response into a "save as" dialog.
          window.location.assign(`/api/export/links?format=${id.slice("app:export-".length)}`);
          return;
        case "app:present": {
          const m = pathname.match(/^\/plans\/([^/]+)/);
          if (m) router.push(`/plans/${m[1]}?present=1`);
          else toast("Abra um plan para apresentar.");
          return;
        }
        case "app:paste-link": {
          let text = "";
          try {
            text = (await navigator.clipboard.readText()).trim();
          } catch {}
          const url = pastedUrl(text);
          if (url) router.push(`/links?add=1&url=${encodeURIComponent(url)}`);
          else {
            toast("A área de transferência não tem um link.");
            router.push("/links?add=1");
          }
          return;
        }
        case "app:new-plan": {
          if (busy.current) return;
          busy.current = true;
          try {
            const planId = await createPlanAction({});
            router.push(`/plans/${planId}/edit`);
          } catch {
            toast.error("Não foi possível criar o plan. Você precisa ser editor neste workspace.");
          } finally {
            busy.current = false;
          }
          return;
        }
      }
    },
    [router, pathname],
  );
}

/**
 * Desktop app only: runs commands sent by the native menu, tray, dock and global shortcut, and
 * keeps the window chrome in step with the page (theme colors, full screen, focus).
 */
export function DesktopCommands({ security }: { security: DesktopSecurity }) {
  const run = useDesktopCommand();
  const theme = useThemePref();
  const { lock, autoLockMinutes, lockOnSleep } = security;

  React.useEffect(
    () =>
      getDesktop()?.onCommand((id, arg) => {
        // The shell reports the computer going to sleep or locking its screen.
        if (id === "app:system-lock") return void (lock && lockOnSleep && lockNow());
        void run(id, arg);
      }),
    [run, lock, lockOnSleep],
  );

  // App lock: lock after `autoLockMinutes` without keyboard or pointer activity in this window.
  React.useEffect(() => {
    if (!lock || !autoLockMinutes) return;
    let last = Date.now();
    const touch = () => (last = Date.now());
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - last >= autoLockMinutes * 60_000) {
        window.clearInterval(timer);
        void lockNow();
      }
    }, 10_000);
    return () => {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, touch, { capture: true }));
    };
  }, [lock, autoLockMinutes]);

  // Windows/Linux: the native menu bar is hidden, so the page answers the menu's shortcuts itself,
  // after the screens' own handlers (anything they already handled is left alone). macOS uses
  // the system menu bar.
  React.useEffect(() => {
    const desktop = getDesktop();
    if (!desktop || desktop.platform === "darwin") return;
    let keys: { accelerator: string; id: string }[] = [];
    void desktop.menu().then((m) => (keys = acceleratorsOf(m ?? [])));
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const hit = keys.find((k) => matchesAccelerator(e, k.accelerator));
      if (!hit) return;
      e.preventDefault();
      void run(hit.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  React.useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return;
    const sync = () => desktop.setTheme(theme, document.documentElement.classList.contains("dark"));
    sync();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [theme]);

  React.useEffect(
    () =>
      getDesktop()?.onWindowState(({ fullScreen, focused }) => {
        const root = document.documentElement;
        root.classList.toggle("wp-fullscreen", fullScreen);
        root.classList.toggle("wp-blurred", !focused);
      }),
    [],
  );

  return null;
}
