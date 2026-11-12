"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { observeViewportApproach } from "@/lib/watch/viewport-approach";

export function DeferredHomeRail({ title, previews, children }: {
  title: string;
  previews: readonly { id: string; shape: string; title: string; subtitle: string; poster: string; href: string }[];
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focusOnLoad = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready || !ref.current) return;
    // A viewer may already have scrolled here while the page was hydrating.
    // Visible content must not wait behind unrelated background transitions.
    return observeViewportApproach(ref.current, () => setReady(true));
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
      onFocus={ready ? undefined : (event) => {
        if (event.target !== event.currentTarget) return;
        focusOnLoad.current = true;
        setReady(true);
      }}
    >
      {ready ? children : (
        <div className="watch-shelf watch-home-shelf-placeholder">
          {previews.map((preview) => (
            <a key={preview.id} href={preview.href} target={/^https?:\/\//.test(preview.href) ? "_blank" : undefined} rel="noopener noreferrer" className={`watch-home-card-placeholder is-${preview.shape}`} data-home-preview={preview.id}>
              {preview.poster ? (
                // Native lazy loading keeps covers available before hydration.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.poster} alt="" loading="lazy" decoding="async" fetchPriority="low" />
              ) : <span className="watch-home-preview-art" aria-hidden="true" />}
              <span className="watch-home-preview-copy">
                <strong>{preview.title}</strong>
                <span>{preview.subtitle}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
