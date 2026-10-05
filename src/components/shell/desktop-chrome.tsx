"use client";
import { usePathname } from "next/navigation";
import { QUICK_PATH } from "@/lib/desktop";
import { DesktopCommands } from "./desktop-commands";
import { TitleBar } from "./title-bar";

/** Desktop app window chrome: title bar and menu commands. The capture window (/quick) has none. */
export function DesktopChrome({ platform }: { platform: string }) {
  const pathname = usePathname();
  if (pathname === QUICK_PATH) return null;
  return (
    <>
      <TitleBar platform={platform} />
      <DesktopCommands />
    </>
  );
}
