import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AskHost } from "@/components/ui/ask";
import { DesktopChrome } from "@/components/shell/desktop-chrome";
import { isDesktop } from "@/server/desktop";
import { desktopSecurity } from "@/server/desktop-security";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Waypoint", template: "%s · Waypoint" },
  description: "Visual Planner & Link Library — o lugar onde você organiza e encontra as coisas.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

// Applies the stored theme before paint to avoid a light/dark flash, including the browser
// chrome color (kept in sync afterwards by lib/theme.ts).
const themeScript = `(function(){try{var t=localStorage.getItem('wp-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);var m=document.createElement('meta');m.name='theme-color';m.content=d?'#0e0f12':'#f5f5f2';document.head.appendChild(m);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Desktop mode is only known at request time, so nothing (not even the 404 page) is prerendered
  // without it. The server runs on the same machine as the window, so its platform is the window's.
  await connection();
  const desktop = isDesktop();
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      data-platform={desktop ? process.platform : undefined}
      className={`${geist.variable} ${geistMono.variable}${desktop ? " wp-desktop" : ""}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {desktop && <DesktopChrome platform={process.platform} security={desktopSecurity()} />}
        {children}
        <AskHost />
        {/* Above the phone tab bar (64px + safe area); colors come from the theme tokens. */}
        <Toaster
          position="bottom-right"
          mobileOffset={{ bottom: "calc(76px + env(safe-area-inset-bottom))" }}
          toastOptions={{ className: "!bg-surface !text-ink !border-line !shadow-pop !rounded-card" }}
        />
      </body>
    </html>
  );
}
