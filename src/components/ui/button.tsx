import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-accent text-white border border-transparent hover:brightness-110 active:brightness-95 shadow-[0_1px_0_rgba(255,255,255,.12)_inset]",
  secondary: "bg-surface text-ink border border-line-2 hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-hover hover:text-ink",
  danger: "bg-surface text-danger border border-line-2 hover:bg-danger-soft",
  soft: "bg-accent-soft text-accent-ink border border-transparent hover:brightness-[.98]",
} as const;

const sizes = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-sm gap-2 rounded-[9px]",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-[10px]",
  icon: "h-8 w-8 rounded-lg p-0 justify-center",
  "icon-sm": "h-7 w-7 rounded-md p-0 justify-center",
} as const;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", asChild, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        "inline-flex shrink-0 select-none items-center whitespace-nowrap font-medium transition-[background,color,filter,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
