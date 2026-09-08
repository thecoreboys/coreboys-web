"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Keep every route aligned with the actual banner/nav/ribbon height. */
export function SiteHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => document.documentElement.style.setProperty("--site-header-h", `${element.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="fixed inset-x-0 top-0 z-50">{children}</div>;
}
