"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowUpRight, History, Lock, LockOpen, ShieldCheck, Zap, type LucideIcon } from "lucide-react";
import { getDesktop, useBackupState, useDesktop } from "@/lib/desktop";
import { useIsMac } from "@/lib/platform";
import { cn, timeAgo } from "@/lib/utils";
import { lockNow } from "@/components/shell/desktop-commands";
import type { DesktopSecurity } from "@/server/desktop-security";

const DAY = 24 * 60 * 60 * 1000;

function Tile({
  icon: Icon,
  tone,
  title,
  detail,
  href,
  action,
}: {
  icon: LucideIcon;
  tone: "success" | "amber" | "accent" | "neutral";
  title: string;
  detail: string;
  href: string;
  action?: { label: string; icon: LucideIcon; run: () => void };
}) {
  const tones = {
    success: "bg-success-bg text-success-ink",
    amber: "bg-amber-bg text-amber-ink",
    accent: "bg-accent-soft text-accent-ink",
    neutral: "bg-subtle text-muted",
  };
  return (
    <div className="group relative flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 shadow-rest transition-shadow hover:shadow-raise">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-control [&_svg]:size-[19px]", tones[tone])}>
        <Icon strokeWidth={1.8} />
      </span>
      <Link href={href} className="flex min-w-0 flex-1 flex-col after:absolute after:inset-0 after:rounded-card">
        <span className="truncate text-body font-semibold">{title}</span>
        <span className="truncate text-caption text-muted">{detail}</span>
      </Link>
      {action && (
        <button
          type="button"
          aria-label={action.label}
          title={action.label}
          onClick={action.run}
          className="relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink [&_svg]:size-4"
        >
          <action.icon strokeWidth={1.9} />
        </button>
      )}
    </div>
  );
}

/** Desktop app home: this computer's status (lock, backups) and the quick capture, one click away. */
export function DesktopCockpit({ security }: { security: DesktopSecurity }) {
  const desktop = useDesktop();
  const router = useRouter();
  const mac = useIsMac();
  const [backups, act] = useBackupState();
  const [saving, setSaving] = React.useState(false);
  if (!desktop) return null;

  const lastAt = backups?.lastAt ?? null;
  const fresh = !!lastAt && Date.now() - lastAt < (backups?.frequency === "weekly" ? 8 : 2) * DAY;

  return (
    <section aria-label="Este computador" className="grid gap-3 sm:grid-cols-3">
      <Tile
        icon={security.lock ? ShieldCheck : LockOpen}
        tone={security.lock ? "success" : "neutral"}
        title={security.lock ? "Protegido com senha" : "Sem bloqueio"}
        detail={security.lock ? (security.autoLockMinutes ? `Bloqueia após ${security.autoLockMinutes} min sem uso` : "Bloqueia ao abrir") : "Ative para pedir senha ao abrir"}
        href="/settings#seguranca"
        action={security.lock ? { label: "Bloquear agora", icon: Lock, run: () => void lockNow(router) } : undefined}
      />
      <Tile
        icon={History}
        tone={fresh ? "success" : "amber"}
        title={lastAt ? `Backup ${timeAgo(lastAt)}` : "Nenhum backup ainda"}
        detail={backups ? `${backups.items.length} ${backups.items.length === 1 ? "cópia guardada" : "cópias guardadas"}` : "…"}
        href="/settings#backups"
        action={{
          label: saving ? "Salvando…" : "Fazer backup agora",
          icon: Archive,
          run: async () => {
            if (saving) return;
            setSaving(true);
            await act("create").catch(() => {});
            setSaving(false);
          },
        }}
      />
      <Tile
        icon={Zap}
        tone="accent"
        title="Captura rápida"
        detail={mac ? "⇧⌘Espaço" : "Ctrl+Shift+Espaço"}
        href="/links?scope=inbox"
        action={{ label: "Abrir captura rápida", icon: ArrowUpRight, run: () => getDesktop()?.run("quick") }}
      />
    </section>
  );
}
