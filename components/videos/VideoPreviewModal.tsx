"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PreviewState = {
  /** YouTube video id. */
  id: string;
  title: string;
  authorLabel: string;
  /** Pinned (click) → unmuted + sticky; hover → muted + auto-dismiss. */
  pinned: boolean;
};

/**
 * Centered video preview overlay rendered via a portal.
 *
 *  - HOVER mode (pinned=false): muted autoplay; the parent closes it the
 *    moment the pointer leaves the originating card. The overlay itself is
 *    pointer-events:none so it never steals the hover.
 *  - CLICK mode (pinned=true): unmuted autoplay, dimmed backdrop, sticky.
 *    Dismissed by clicking the backdrop, the close/minimize buttons, or
 *    pressing Escape.
 *
 * Smooth fade/scale in. The player is keyed by id so switching videos
 * remounts the iframe (fresh autoplay) instead of reusing a stale frame.
 */
export function VideoPreviewModal({
  preview,
  onClose,
}: {
  preview: PreviewState | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Portal target only exists on the client.
  useEffect(() => setMounted(true), []);

  // Trigger the enter transition on the next frame after preview appears.
  useEffect(() => {
    if (preview) {
      rafRef.current = requestAnimationFrame(() => setEntered(true));
    } else {
      setEntered(false);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [preview]);

  // Escape closes a pinned player.
  useEffect(() => {
    if (!preview?.pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview?.pinned, onClose]);

  // Lock body scroll while pinned (modal-like). Hover preview leaves it.
  useEffect(() => {
    if (!preview?.pinned) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [preview?.pinned]);

  if (!mounted || !preview) return null;

  const pinned = preview.pinned;
  const muteParam = pinned ? "0" : "1";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const qs = new URLSearchParams({
    autoplay: "1",
    mute: muteParam,
    rel: "0",
    playsinline: "1",
    modestbranding: "1",
  });
  if (origin) {
    qs.set("origin", origin);
    qs.set("widget_referrer", origin);
  }
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(preview.id)}?${qs.toString()}`;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[120] grid place-items-center p-4 transition-opacity duration-200",
        // Hover preview must NOT capture the pointer (would break the
        // card's mouseleave); pinned mode is interactive.
        pinned ? "pointer-events-auto" : "pointer-events-none",
        entered ? "opacity-100" : "opacity-0",
      )}
      // Backdrop click-off only when pinned.
      onMouseDown={
        pinned
          ? (e) => {
              if (e.target === e.currentTarget) onClose();
            }
          : undefined
      }
      role={pinned ? "dialog" : "presentation"}
      aria-modal={pinned ? true : undefined}
      aria-label={pinned ? preview.title : undefined}
    >
      {/* Backdrop. Heavier dim when pinned. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 transition-colors duration-200",
          pinned ? "bg-black/80 backdrop-blur-sm" : "bg-black/55",
        )}
      />

      <div
        className={cn(
          "relative w-full max-w-4xl transform-gpu transition-all duration-200 ease-out",
          entered ? "scale-100 translate-y-0" : "scale-95 translate-y-2",
        )}
      >
        {/* Header — title + controls (controls only meaningful when pinned). */}
        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-white/70">
              {preview.authorLabel}
            </p>
            <h2 className="mt-0.5 line-clamp-1 text-md font-semibold tracking-tight text-white">
              {preview.title}
            </h2>
          </div>
          {pinned ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={onClose}
                aria-label="Minimize preview"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 cursor-pointer"
              >
                <Minus size={16} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close preview"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
        </div>

        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/15 bg-black shadow-2xl ring-1 ring-black/40">
          <iframe
            key={preview.id}
            src={src}
            title={preview.title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>

        {!pinned ? (
          <p className="mt-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-white/60">
            Click to play with sound
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
