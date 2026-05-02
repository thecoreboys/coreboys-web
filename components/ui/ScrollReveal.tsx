"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export type ScrollRevealProps = {
  children: React.ReactNode;
  /** Stagger between immediate children (in seconds). */
  stagger?: number;
  /** Delay before the first child reveals. */
  delay?: number;
  /** Per-item travel distance — default `24` looks corporate-grade. */
  distance?: number;
  /** Per-item duration. */
  duration?: number;
  /** Margin offset for the in-view trigger — see framer-motion `viewport.margin`. */
  margin?: string;
  className?: string;
  /** Defaults to `<div>`; pass `"ul"` / `"section"` etc. when semantics matter. */
  as?: "div" | "section" | "ul" | "ol" | "header" | "article";
};

/**
 * Drop-in scroll-triggered reveal wrapper. When the wrapper enters the
 * viewport, its `<ScrollItem>` children fade + slide up with a stagger.
 * Plays once.
 *
 * Server components can render their children inside this without
 * becoming client components themselves — only this wrapper is "use
 * client".
 */
export function ScrollReveal({
  children,
  stagger = 0.08,
  delay = 0,
  margin = "-12%",
  className,
  as = "div",
}: ScrollRevealProps) {
  const reduced = useReducedMotion();
  // Defer `whileInView` until after hydration. Without this, items already
  // in the viewport on first paint advance to the "show" state on the
  // client before React finishes hydrating, while SSR markup is still in
  // the "hidden" state — causing an opacity/transform mismatch warning.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const container: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduced ? 0 : stagger, delayChildren: delay },
    },
  };

  const Comp = motion[as] as typeof motion.div;

  return (
    <Comp
      className={className}
      initial="hidden"
      whileInView={mounted ? "show" : undefined}
      viewport={{ once: true, margin }}
      variants={container}
    >
      {children}
    </Comp>
  );
}

/**
 * Per-item reveal — pair with `<ScrollReveal stagger={n}>` to drive
 * staggered grid reveals. Wrap each grid cell in `<ScrollItem>`.
 */
export function ScrollItem({
  children,
  className,
  as = "li",
  distance = 24,
  duration = 0.6,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li";
  distance?: number;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const item: Variants = {
    hidden: reduced ? { opacity: 1 } : { opacity: 0, y: distance },
    show: reduced
      ? { opacity: 1 }
      : { opacity: 1, y: 0, transition: { duration, ease: EASE_OUT } },
  };

  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp className={className} variants={item}>
      {children}
    </Comp>
  );
}
