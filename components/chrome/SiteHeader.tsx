"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Keep every route aligned with the actual banner/nav/ribbon height. */
export function SiteHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame: number | null = null;
    let height: number | null = null;
    const update = () => {
      frame = null;
      const nextHeight = element.getBoundingClientRect().height;
      if (height === nextHeight) return;
      height = nextHeight;
      document.documentElement.style.setProperty("--site-header-h", `${nextHeight}px`);
    };
    update();
    const observer = new ResizeObserver(() => {
      if (frame === null) frame = requestAnimationFrame(update);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);
  return <div ref={ref} className="site-header fixed inset-x-0 top-0 z-50">{children}</div>;
}
