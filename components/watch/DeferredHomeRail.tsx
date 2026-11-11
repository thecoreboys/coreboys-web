"use client";

import { startTransition, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { observeViewportApproach } from "@/lib/watch/viewport-approach";

export function DeferredHomeRail({ title, shapes, children }: {
  title: string;
  shapes: readonly string[];
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focusOnLoad = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready || !ref.current) return;
    return observeViewportApproach(ref.current, () => startTransition(() => setReady(true)));
  }, [ready]);

  useLayoutEffect(() => {
    if (!ready || !focusOnLoad.current) return;
    focusOnLoad.current = false;
    ref.current?.querySelector<HTMLElement>(".watch-shelf")?.focus({ preventScroll: true });
  }, [ready]);

  return (
    <div
      ref={ref}
      data-home-rail={ready ? "ready" : "pending"}
      role={ready ? undefined : "group"}
      aria-label={ready ? undefined : title}
      tabIndex={ready ? undefined : 0}
      onFocus={ready ? undefined : () => {
        focusOnLoad.current = true;
        setReady(true);
      }}
    >
      {ready ? children : (
        <div className="watch-shelf watch-home-shelf-placeholder" aria-hidden="true">
          {shapes.map((shape, index) => (
            <span key={index} className={`watch-home-card-placeholder is-${shape}`} />
          ))}
        </div>
      )}
    </div>
  );
}
