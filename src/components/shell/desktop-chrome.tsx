"use client";
import { usePathname } from "next/navigation";
import { QUICK_PATH } from "@/lib/desktop";
import type { DesktopSecurity } from "@/server/desktop-security";
import { DesktopCommands } from "./desktop-commands";
import { TitleBar } from "./title-bar";

/**
 * Desktop app window chrome: title bar and menu commands. The capture window (/quick) has none;
 * the lock screen (/login) keeps only a bare title bar to move the window.
 */
export function DesktopChrome({ platform, security }: { platform: string; security: DesktopSecurity }) {
  const pathname = usePathname();
  if (pathname === QUICK_PATH) return null;
  if (pathname.startsWith("/login")) return <TitleBar platform={platform} bare />;
  return (
    <>
      <TitleBar platform={platform} security={security} />
      <DesktopCommands security={security} />
    </>
  );
}
