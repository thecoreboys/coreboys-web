"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

type CommonProps = {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
};

type PillButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;
type PillLinkProps = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

const base =
  "group relative inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-xs uppercase tracking-[0.18em] font-medium transition-[transform,background,border-color,color] duration-200 [transition-timing-function:var(--ease-expo-out)]";

const variants: Record<Variant, string> = {
  primary:
    "border-[color:var(--core)] bg-[color:var(--core)] text-[color:var(--bg)] hover:-translate-y-0.5 hover:shadow-[0_8px_30px_color-mix(in_oklab,var(--core)_40%,transparent)]",
  ghost:
    "border-[color:var(--rule)] bg-transparent text-[color:var(--ink)] hover:border-[color:var(--ink)]/40 hover:bg-[color:var(--ink)]/5 hover:-translate-y-0.5",
};

export const Pill = forwardRef<HTMLButtonElement, PillButtonProps>(function Pill(
  { variant = "primary", className, children, ...props },
  ref,
) {
  return (
    <button ref={ref} className={cn(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
});

export function PillLink({ variant = "primary", className, children, href, ...props }: PillLinkProps) {
  return (
    <a href={href} className={cn(base, variants[variant], className)} {...props}>
      {children}
    </a>
  );
}
