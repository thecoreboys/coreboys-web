import { createElement, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 12-column container with the prompt's gutters: 64px desktop, 24px mobile.
 * Visualize via the dev-only ?grid=1 overlay.
 */
export function Container({
  children,
  className,
  as = "div",
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: ElementType; children: ReactNode }) {
  return createElement(
    as,
    {
      ...rest,
      "data-grid": true,
      className: cn("mx-auto w-full max-w-[1440px] px-6 md:px-16", className),
    },
    children,
  );
}
