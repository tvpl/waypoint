"use client";
import { cn } from "@/lib/utils";

/** Small accessible on/off switch (role="switch"). */
export function Switch({
  checked,
  onChange,
  label,
  id,
  className,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-3 focus-visible:ring-accent/30 disabled:opacity-50",
        checked ? "bg-accent" : "bg-line-2",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("inline-block size-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.25)] transition-transform", checked ? "translate-x-[15px]" : "translate-x-[1px]")}
      />
    </button>
  );
}
