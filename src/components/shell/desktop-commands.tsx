"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPlanAction } from "@/app/(app)/plans/actions";
import { acceleratorsOf, getDesktop, matchesAccelerator, TOGGLE_RAIL_EVENT } from "@/lib/desktop";
import { applyTheme, openPalette, useThemePref } from "@/lib/theme";
import { pastedUrl } from "@/lib/url";
import { openShortcuts } from "./shortcuts";

const GO: Record<string, string> = {
  "app:go-home": "/",
  "app:go-plans": "/plans",
  "app:go-links": "/links",
  "app:go-tags": "/tags",
  "app:go-settings": "/settings",
  "app:add-link": "/links?add=1",
  "app:new-collection": "/links?newCollection=1",
  "app:import": "/links/import",
  "app:extension": "/settings#api-tokens",
};

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
export function DesktopCommands() {
  const run = useDesktopCommand();
  const theme = useThemePref();

  React.useEffect(() => getDesktop()?.onCommand((id, arg) => void run(id, arg)), [run]);

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
