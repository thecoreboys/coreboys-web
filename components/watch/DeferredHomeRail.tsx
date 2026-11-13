"use client";

import { startTransition, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { getImageProps } from "next/image";
import { isInstagramCdnImage } from "@/lib/watch/thumbs";
import { observeViewportApproach } from "@/lib/watch/viewport-approach";
import { HOME_INTRO_PRELOAD_EVENT } from "@/lib/first-visit-intro";

/** Full-resolution Instagram photos are resized to the placeholder card. */
function PreviewCover({ src }: { src: string }) {
  const resized = isInstagramCdnImage(src)
    ? getImageProps({ src, alt: "", width: 480, height: 600, sizes: "(max-width: 640px) 46vw, 240px" }).props
    : null;
  return (
    // Native lazy loading keeps covers available before hydration.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resized?.src ?? src} srcSet={resized?.srcSet} sizes={resized?.sizes} alt="" loading="lazy" decoding="async" fetchPriority="low" />
  );
}

export function DeferredHomeRail({ title, previews, children }: {
  title: string;
  previews: readonly { id: string; shape: string; title: string; subtitle: string; poster: string; href: string }[];
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focusOnLoad = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const preload = (event: Event) => {
      if ((event as CustomEvent<HTMLElement>).detail === ref.current) startTransition(() => setReady(true));
    };
    window.addEventListener(HOME_INTRO_PRELOAD_EVENT, preload);
    return () => window.removeEventListener(HOME_INTRO_PRELOAD_EVENT, preload);
  }, []);

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
              {preview.poster ? <PreviewCover src={preview.poster} /> : <span className="watch-home-preview-art" aria-hidden="true" />}
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
