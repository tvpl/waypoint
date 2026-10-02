"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { formatKeys, useIsMac } from "@/lib/platform";
import { monogramColors } from "@/lib/color";

/** Keyboard key(s). String content is shown for the user's platform ("⌘K" → "Ctrl+K" off Mac). */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  const mac = useIsMac();
  return (
    <kbd className={cn("rounded-[5px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-caption font-normal text-muted", className)}>
      {typeof children === "string" ? (children === "⌘" ? (mac ? "⌘" : "Ctrl") : formatKeys(children, mac)) : children}
    </kbd>
  );
}

export function TagChip({ name, active, onRemove, className, href }: { name: string; active?: boolean; onRemove?: () => void; className?: string; href?: string }) {
  const cls = cn(
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
    active ? "border border-accent-line bg-accent-soft font-medium text-accent-ink" : "bg-subtle text-ink-2",
    className,
  );
  const body = (
    <>
      #{name}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remover tag ${name}`} className="-mr-0.5 ml-0.5 rounded-full px-0.5 leading-none opacity-70 hover:opacity-100">
          ×
        </button>
      )}
    </>
  );
  return href ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "success" | "amber" | "accent"; children: React.ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-subtle text-ink-2",
    success: "bg-success-bg text-success-ink",
    amber: "bg-amber-bg text-amber-ink",
    accent: "bg-accent-soft text-accent-ink",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium", tones[tone], className)}>{children}</span>;
}

/** Favicon with a monogram fallback (also used when no favicon is known). */
export function SiteIcon({ src, label, size = 28, className }: { src?: string | null; label: string; size?: number; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const { bg, fg } = monogramColors(label);
  const letter = (label.trim()[0] ?? "?").toUpperCase();
  const radius = Math.round(size * 0.27);
  if (src && !failed) {
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden border border-line bg-surface", className)} style={{ width: size, height: size, borderRadius: radius }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} ref={(el) => { if (el?.complete && el.naturalWidth === 0) setFailed(true); }} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn("wp-tint inline-flex shrink-0 items-center justify-center font-semibold", className)}
      style={{ width: size, height: size, borderRadius: radius, "--tint": bg, "--tint-ink": fg, fontSize: Math.round(size * 0.46) } as React.CSSProperties}
    >
      {letter}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode; title?: string }[];
  className?: string;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex gap-0.5 rounded-lg bg-subtle p-[3px]", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors [&_svg]:size-3.5",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-xs",
              on ? "bg-surface text-ink shadow-thumb" : "text-muted hover:text-ink",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-2 px-6 py-14 text-center", className)}>
      {icon && <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink [&_svg]:size-5">{icon}</span>}
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-lead font-semibold">{title}</p>
        {description && <p className="text-body leading-5 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Loading placeholder block (shape it with width/height/rounded classes). */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={cn("wp-skeleton block", className)} style={style} />;
}

/** Wrapper announcing a loading region to assistive tech. */
export function LoadingRegion({ label = "Carregando", className, children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}
