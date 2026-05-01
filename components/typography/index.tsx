import { cn } from "@/lib/utils";
import {
  createElement,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";

/**
 * The only typography you should reach for. Raw `<h1>` / `<p>` styling outside
 * this file is a smell — if you need something new, add a variant here.
 *
 * Every component snaps to the strict type scale (12 / 14 / 16 / 18 / 24 / 32
 * / 48 / 72 / 120 / 200). The `size` prop is constrained to that list.
 */

type Size = 12 | 14 | 16 | 18 | 24 | 32 | 48 | 72 | 120 | 200;

const SIZE_CLASS: Record<Size, string> = {
  12: "text-[12px] leading-[16px]",
  14: "text-[14px] leading-[20px]",
  16: "text-[16px] leading-[24px]",
  18: "text-[18px] leading-[26px]",
  24: "text-[24px] leading-[32px] tracking-[-0.02em]",
  32: "text-[32px] leading-[36px] tracking-[-0.02em]",
  48: "text-[48px] leading-[1.05] tracking-[-0.04em]",
  72: "text-[72px] leading-[1.02] tracking-[-0.04em]",
  120: "text-[120px] leading-[0.95] tracking-[-0.04em]",
  200: "text-[200px] leading-[0.88] tracking-[-0.04em]",
};

type Props = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  size?: Size;
  className?: string;
  children: ReactNode;
};

export function Display({ as = "h1", size = 120, className, children, ...rest }: Props) {
  return createElement(
    as,
    {
      ...rest,
      className: cn(
        "font-display font-black text-[color:var(--ink)]",
        SIZE_CLASS[size],
        className,
      ),
    },
    children,
  );
}

export function Eyebrow({ as = "div", className, children, ...rest }: Omit<Props, "size">) {
  return createElement(
    as,
    {
      ...rest,
      className: cn(
        "font-mono uppercase text-[12px] leading-[16px] tracking-[0.18em] text-[color:var(--ink-dim)]",
        className,
      ),
    },
    children,
  );
}

export function Lede({ as = "p", size = 24, className, children, ...rest }: Props) {
  return createElement(
    as,
    {
      ...rest,
      className: cn(
        "font-display font-normal text-[color:var(--ink)]",
        SIZE_CLASS[size],
        className,
      ),
    },
    children,
  );
}

export function Body({ as = "p", size = 16, className, children, ...rest }: Props) {
  return createElement(
    as,
    {
      ...rest,
      className: cn(
        "font-sans text-[color:var(--ink)]",
        SIZE_CLASS[size],
        className,
      ),
    },
    children,
  );
}

export function Caption({ as = "span", size = 12, className, children, ...rest }: Props) {
  return createElement(
    as,
    {
      ...rest,
      className: cn(
        "font-sans text-[color:var(--ink-dim)]",
        SIZE_CLASS[size],
        className,
      ),
    },
    children,
  );
}
