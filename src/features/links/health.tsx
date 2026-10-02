"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tooltip } from "@/components/ui/popover";
import { cn, timeAgo } from "@/lib/utils";
import type { LinkHealth, LinkItem } from "./types";

type HealthFields = Pick<LinkItem, "healthStatus" | "healthCode" | "healthCheckedAt" | "healthFinalUrl">;

/** "exemplo.com/caminho" — compact form of a URL for labels. */
export function shortUrl(url: string, max = 48) {
  try {
    const u = new URL(url);
    const s = `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}${u.search}`;
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  } catch {
    return url;
  }
}

/** "verificado há 2 h" (or "" when never checked). */
export function checkedAgo(checkedAt: number | null): string {
  if (!checkedAt) return "";
  const t = timeAgo(checkedAt);
  return t === "agora" ? "verificado há instantes" : /^\d/.test(t) ? `verificado em ${t}` : `verificado ${t}`;
}

/** Human description of a link's health ("Link quebrado (404) · verificado há 2 h"). */
export function healthText(h: HealthFields, opts: { withTime?: boolean } = {}): string {
  const when = h.healthCheckedAt ? ` · ${checkedAgo(h.healthCheckedAt)}` : "";
  const code = h.healthCode ? ` (${h.healthCode})` : "";
  let base: string;
  switch (h.healthStatus) {
    case "broken":
      base = `Link quebrado${code}`;
      break;
    case "unreachable":
      base = `Não foi possível acessar${code}`;
      break;
    case "redirect":
      base = h.healthFinalUrl ? `Redireciona para ${shortUrl(h.healthFinalUrl)}` : "Redireciona para outro endereço";
      break;
    case "ok":
      base = h.healthCode === 401 || h.healthCode === 403 ? `Funcionando · acesso restrito${code}` : "Funcionando";
      break;
    default:
      return "Ainda não verificado";
  }
  return opts.withTime === false ? base : base + when;
}

const DOT: Record<LinkHealth, string> = {
  broken: "bg-danger",
  unreachable: "border-[1.5px] border-danger bg-transparent",
  redirect: "bg-[#d99a06] dark:bg-amber-ink",
  ok: "bg-success-ink",
  unknown: "border-[1.5px] border-line-2 bg-transparent",
};

export function HealthMark({ status, className }: { status: LinkHealth; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[status], className)} />;
}

/** Small status dot for cards and rows; renders nothing for healthy / unchecked links. */
export function HealthDot({ link, className }: { link: LinkItem; className?: string }) {
  if (link.healthStatus === "ok" || link.healthStatus === "unknown") return null;
  const label = healthText(link);
  return (
    <Tooltip content={<span className="block max-w-[280px] break-words">{label}</span>}>
      <span
        role="img"
        tabIndex={0}
        aria-label={label}
        className={cn(
          "relative z-10 inline-flex size-4 shrink-0 cursor-default items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent",
          className,
        )}
      >
        <HealthMark status={link.healthStatus} />
      </span>
    </Tooltip>
  );
}

// ------------------------------------------------------------------ running checks

export type HealthResult = { id: string; status: LinkHealth; code: number | null; finalUrl: string | null; checkedAt: number };
type Summary = { checked: number; ok: number; broken: number; redirect: number; unreachable: number; remaining: number; results: HealthResult[] };

async function callHealth(body: Record<string, unknown>): Promise<Summary> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch("/api/links/health", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 429 && attempt < 3) {
      const wait = Number(r.headers.get("retry-after") ?? "5");
      await new Promise((res) => setTimeout(res, Math.min(30, Math.max(1, wait)) * 1000));
      continue;
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data as { error?: string }).error ?? "Não foi possível verificar os links.");
    return data as Summary;
  }
}

/** Checks a few links right away (forced) and returns their new status. */
export async function checkLinksNow(ids: string[]): Promise<HealthResult[]> {
  const s = await callHealth({ ids, force: true, limit: ids.length });
  return s.results;
}

export function toHealthPatch(r: HealthResult): Partial<LinkItem> {
  return { healthStatus: r.status, healthCode: r.code, healthFinalUrl: r.finalUrl, healthCheckedAt: r.checkedAt };
}

let running = false;
const BATCH = 12;

/**
 * Runs a (possibly long) check of a collection or the whole library in batches,
 * with a progress toast that can be cancelled.
 */
type RunTarget = { collectionId?: string | null; name?: string };
type Run = (target: RunTarget, opts?: { force?: boolean }) => Promise<void>;

export function useHealthRun(): Run {
  const router = useRouter();
  const self = React.useRef<Run | null>(null);
  const run = React.useCallback<Run>(
    async (target, opts = {}) => {
      if (running) {
        toast.info("Já existe uma verificação em andamento.");
        return;
      }
      running = true;
      const toastId = `health-${Date.now()}`;
      let cancelled = false;
      const where = target.name ? ` em “${target.name}”` : "";
      const progress = (done: number, total: number | null) =>
        toast.loading(total ? `Verificando links${where}… ${done} de ${total}` : `Verificando links${where}…`, {
          id: toastId,
          description: "Você pode continuar usando o Waypoint enquanto isso.",
          duration: Infinity,
          action: { label: "Parar", onClick: () => (cancelled = true) },
        });
      progress(0, null);
      const startedAt = Date.now();
      const acc = { checked: 0, ok: 0, broken: 0, redirect: 0, unreachable: 0 };
      let total: number | null = null;
      try {
        while (!cancelled) {
          const s = await callHealth({ collectionId: target.collectionId ?? undefined, force: !!opts.force, startedAt, limit: BATCH });
          for (const k of ["checked", "ok", "broken", "redirect", "unreachable"] as const) acc[k] += s[k];
          total = Math.max(total ?? 0, acc.checked + s.remaining);
          if (!cancelled) progress(acc.checked, total);
          if (s.remaining === 0 || s.checked === 0) break;
        }
      } catch (e) {
        toast.error((e as Error).message, { id: toastId, duration: 6000, description: undefined, action: undefined });
        running = false;
        if (acc.checked) router.refresh();
        return;
      }
      running = false;
      router.refresh();

      const bad = acc.broken + acc.unreachable;
      const parts = [
        acc.broken && `${acc.broken} ${acc.broken === 1 ? "quebrado" : "quebrados"}`,
        acc.unreachable && `${acc.unreachable} ${acc.unreachable === 1 ? "inacessível" : "inacessíveis"}`,
        acc.redirect && `${acc.redirect} ${acc.redirect === 1 ? "redireciona" : "redirecionam"}`,
      ].filter(Boolean);
      const common = { id: toastId, duration: 8000 };
      if (acc.checked === 0) {
        toast.success(cancelled ? "Verificação interrompida" : "Tudo em dia", {
          ...common,
          description: cancelled ? undefined : "Os links foram verificados nas últimas 24 horas.",
          action: cancelled ? undefined : { label: "Verificar de novo", onClick: () => setTimeout(() => self.current?.(target, { force: true }), 0) },
        });
        return;
      }
      const title = `${cancelled ? "Verificação interrompida · " : ""}${acc.checked} ${acc.checked === 1 ? "link verificado" : "links verificados"}`;
      const description = parts.length ? parts.join(" · ") : "Todos funcionando.";
      const action = bad ? { label: "Ver quebrados", onClick: () => router.push("/links?scope=broken") } : undefined;
      if (bad) toast.warning(title, { ...common, description, action });
      else toast.success(title, { ...common, description, action: undefined });
    },
    [router],
  );
  React.useEffect(() => {
    self.current = run;
  }, [run]);
  return run;
}
