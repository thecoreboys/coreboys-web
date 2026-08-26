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
  "group relative inline-flex cursor-pointer items-center gap-2 rounded-full border px-5 py-2.5 text-xs uppercase tracking-[0.18em] font-medium transition-[transform,background,border-color,color,box-shadow] duration-150 ease-out [transition-timing-function:var(--ease-expo-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "border-transparent bg-brand-solid text-white shadow-xs-skeuomorphic hover:-translate-y-0.5 hover:bg-brand-solid_hover hover:shadow-[0_8px_30px_color-mix(in_oklab,var(--core)_40%,transparent)]",
  ghost:
    "border-primary bg-transparent text-secondary hover:border-brand hover:bg-primary_hover hover:-translate-y-0.5",
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
