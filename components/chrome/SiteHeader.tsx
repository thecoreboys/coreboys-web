"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Keep every route aligned with the actual banner/nav/ribbon height. */
export function SiteHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    let height = "";
    const update = () => {
      frame = 0;
      const next = `${element.getBoundingClientRect().height}px`;
      if (next === height) return;
      height = next;
      document.documentElement.style.setProperty("--site-header-h", next);
    };
    update();
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(update);
    });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return <div ref={ref} className="site-header fixed inset-x-0 top-0 z-50">{children}</div>;
}
