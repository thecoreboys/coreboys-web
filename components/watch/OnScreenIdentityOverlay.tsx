"use client";

import Link from "next/link";
import { Eye, EyeOff, UserRound } from "lucide-react";
import {
  parsePublicFacePresenceResponse,
  type PublicFacePresenceTag,
} from "@/lib/face-presence-public";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const VISIBILITY_KEY = "core-face-presence-visible:v1";
const CLIENT_PRESENCE_ENABLED = process.env.NEXT_PUBLIC_FACE_PRESENCE_UI_ENABLED === "true";

type IdentityOverlayVariant = "overlay" | "rail" | "compact";

export type OnScreenIdentityOverlayProps = {
  contentId: string;
  mode: "vod" | "live";
  variant: IdentityOverlayVariant;
  /** Called at poll time so a native or provider player can expose its current PTS. */
  getMediaTimeMs?: () => number | null;
  /** Lets normalized boxes follow the visible pixels through contain/cover. */
  mediaElementRef?: RefObject<HTMLVideoElement | null>;
  mediaFit?: "contain" | "cover";
  enabled?: boolean;
  className?: string;
};

type MediaGeometry = {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
};

function clampedPercent(value: number): string {
  return `${Math.max(7, Math.min(93, value * 100))}%`;
}

function tagPosition(
  tag: PublicFacePresenceTag,
  geometry: MediaGeometry | null,
  index: number,
): React.CSSProperties {
  if (!tag.bbox) {
    return { left: "50%", top: `${Math.min(88, 72 + index * 8)}%` };
  }
  const centerX = tag.bbox.x + tag.bbox.width / 2;
  const bottomY = tag.bbox.y + tag.bbox.height + 0.02;
  const mappedX = geometry ? geometry.offsetX + centerX * geometry.scaleX : centerX;
  const mappedY = geometry ? geometry.offsetY + bottomY * geometry.scaleY : bottomY;
  return {
    left: clampedPercent(mappedX),
    top: clampedPercent(mappedY),
  };
}

function Avatar({ tag }: { tag: PublicFacePresenceTag }) {
  if (tag.avatarUrl) {
    // Presence payloads accept canonical same-site portraits only. A plain img
    // avoids making these tiny, non-LCP identity chips part of image optimizer
    // state while still preventing third-party tracking pixels.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={tag.avatarUrl} alt="" className="size-7 shrink-0 rounded-full object-cover ring-1 ring-white/25" />;
  }
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/12 ring-1 ring-white/20" aria-hidden="true">
      <UserRound className="size-3.5" />
    </span>
  );
}

function IdentityChip({
  tag,
  overlay = false,
  geometry = null,
  index = 0,
}: {
  tag: PublicFacePresenceTag;
  overlay?: boolean;
  geometry?: MediaGeometry | null;
  index?: number;
}) {
  const primaryHandle = tag.socialLinks.find((link) => link.label.startsWith("@"))?.label
    ?? tag.socialLinks[0]?.label;
  return (
    <Link
      href={tag.profileHref as never}
      onClick={(event) => event.stopPropagation()}
      className={`pointer-events-auto inline-flex min-h-10 max-w-56 items-center gap-2 rounded-full border border-white/20 bg-black/88 py-1.5 pl-1.5 pr-3 text-white shadow-2xl backdrop-blur-md transition hover:border-white/45 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${overlay ? "absolute -translate-x-1/2" : ""}`}
      style={overlay ? tagPosition(tag, geometry, index) : undefined}
      title={`Open ${tag.displayName}'s profile`}
    >
      <Avatar tag={tag} />
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold leading-4">{tag.displayName}</span>
        <span className="block truncate text-[9px] font-semibold text-white/55">
          {primaryHandle ?? "On screen now"}
        </span>
      </span>
    </Link>
  );
}

export function OnScreenIdentityOverlay({
  contentId,
  mode,
  variant,
  getMediaTimeMs,
  mediaElementRef,
  mediaFit = "contain",
  enabled = CLIENT_PRESENCE_ENABLED,
  className = "",
}: OnScreenIdentityOverlayProps) {
  const timeReader = useRef(getMediaTimeMs);
  const [tags, setTags] = useState<PublicFacePresenceTag[]>([]);
  const [visible, setVisible] = useState(true);
  const [mediaGeometry, setMediaGeometry] = useState<MediaGeometry | null>(null);
  const requestSequence = useRef(0);
  const observedMediaTime = useRef<{ mediaMs: number; observedAt: number } | null>(null);

  useEffect(() => {
    timeReader.current = getMediaTimeMs;
  }, [getMediaTimeMs]);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(VISIBILITY_KEY) !== "hidden");
    } catch {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    requestSequence.current += 1;
    observedMediaTime.current = null;
    setTags([]);
  }, [contentId]);

  useEffect(() => {
    if (!enabled || mode !== "vod" || !contentId) return;
    const clearForDiscontinuity = () => {
      requestSequence.current += 1;
      setTags((current) => current.length ? [] : current);
      observedMediaTime.current = null;
    };
    const media = mediaElementRef?.current;
    media?.addEventListener("seeking", clearForDiscontinuity);

    const observe = () => {
      if (document.visibilityState !== "visible") {
        observedMediaTime.current = null;
        return;
      }
      const mediaMs = timeReader.current?.();
      const observedAt = performance.now();
      if (typeof mediaMs !== "number" || !Number.isFinite(mediaMs) || mediaMs < 0) {
        clearForDiscontinuity();
        return;
      }
      const prior = observedMediaTime.current;
      observedMediaTime.current = { mediaMs, observedAt };
      if (!prior) return;
      const mediaAdvance = mediaMs - prior.mediaMs;
      const wallAdvance = observedAt - prior.observedAt;
      // Normal playback may pause or run several times faster. A sizeable
      // backwards jump, or a forward jump well beyond elapsed wall time, is a
      // seek/provider discontinuity and must hide the old identity immediately.
      if (mediaAdvance < -250 || mediaAdvance > wallAdvance + 750) {
        requestSequence.current += 1;
        setTags((current) => current.length ? [] : current);
      }
    };
    observe();
    const interval = window.setInterval(observe, 200);
    return () => {
      media?.removeEventListener("seeking", clearForDiscontinuity);
      window.clearInterval(interval);
      observedMediaTime.current = null;
    };
  }, [contentId, enabled, mediaElementRef, mode]);

  useEffect(() => {
    const media = mediaElementRef?.current;
    if (!media) {
      setMediaGeometry(null);
      return;
    }
    const update = () => {
      const containerWidth = media.clientWidth;
      const containerHeight = media.clientHeight;
      const sourceWidth = media.videoWidth;
      const sourceHeight = media.videoHeight;
      if (!containerWidth || !containerHeight || !sourceWidth || !sourceHeight) {
        setMediaGeometry(null);
        return;
      }
      const sourceRatio = sourceWidth / sourceHeight;
      const containerRatio = containerWidth / containerHeight;
      let renderedWidth: number;
      let renderedHeight: number;
      if ((mediaFit === "contain" && sourceRatio > containerRatio) || (mediaFit === "cover" && sourceRatio <= containerRatio)) {
        renderedWidth = containerWidth;
        renderedHeight = containerWidth / sourceRatio;
      } else {
        renderedHeight = containerHeight;
        renderedWidth = containerHeight * sourceRatio;
      }
      setMediaGeometry({
        offsetX: (containerWidth - renderedWidth) / 2 / containerWidth,
        offsetY: (containerHeight - renderedHeight) / 2 / containerHeight,
        scaleX: renderedWidth / containerWidth,
        scaleY: renderedHeight / containerHeight,
      });
    };
    update();
    media.addEventListener("loadedmetadata", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(media);
    return () => {
      media.removeEventListener("loadedmetadata", update);
      observer?.disconnect();
    };
  }, [contentId, mediaElementRef, mediaFit]);

  const load = useCallback(async (signal: AbortSignal) => {
    if (!enabled || !contentId || document.visibilityState !== "visible") return;
    const mediaTime = mode === "vod" ? timeReader.current?.() : null;
    if (mode === "vod" && (typeof mediaTime !== "number" || !Number.isFinite(mediaTime) || mediaTime < 0)) {
      setTags([]);
      return;
    }
    const sequence = ++requestSequence.current;
    const params = new URLSearchParams({ contentId });
    if (mode === "vod" && mediaTime != null) params.set("atMs", String(Math.round(mediaTime)));
    try {
      const response = await fetch(`/api/watch/presence?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        if (sequence === requestSequence.current) setTags([]);
        return;
      }
      const parsed = parsePublicFacePresenceResponse(await response.json());
      if (sequence !== requestSequence.current) return;
      if (!parsed || parsed.contentId !== contentId) {
        setTags([]);
        return;
      }
      setTags(parsed.tags);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        // Presence is an enhancement. Playback must continue when its API is absent.
        if (sequence === requestSequence.current) setTags([]);
      }
    }
  }, [contentId, enabled, mode]);

  useEffect(() => {
    if (!enabled || !contentId) return;
    let controller = new AbortController();
    const refresh = () => {
      controller.abort();
      controller = new AbortController();
      void load(controller.signal);
    };
    refresh();
    const interval = window.setInterval(refresh, visible ? 2_000 : 10_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Do not briefly revive a tag from the frame that was visible before
        // the tab was backgrounded. Fetch the identity for the current PTS.
        setTags([]);
        refresh();
        return;
      }
      requestSequence.current += 1;
      controller.abort();
      setTags([]);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [contentId, enabled, load, visible]);

  const toggleVisibility = () => {
    setVisible((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(VISIBILITY_KEY, next ? "visible" : "hidden");
      } catch {
        // Local preference persistence is optional.
      }
      return next;
    });
  };

  if (!enabled || !tags.length) return null;

  if (variant === "overlay") {
    return (
      <div className={`pointer-events-none absolute inset-0 z-[19] ${className}`} data-face-presence-overlay>
        <div className="sr-only" aria-live="polite">
          {visible && tags.length ? `On screen now: ${tags.map((tag) => tag.displayName).join(", ")}` : "On-screen identity tags hidden"}
        </div>
        {visible ? tags.map((tag, index) => (
          <IdentityChip
            key={tag.trackId}
            tag={tag}
            overlay
            geometry={mediaGeometry}
            index={index}
          />
        )) : null}
        <button
          type="button"
          onClick={toggleVisibility}
          className="pointer-events-auto absolute bottom-3 right-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/15 bg-black/80 px-3 text-[10px] font-semibold text-white/75 shadow-xl backdrop-blur-md hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-pressed={!visible}
          aria-label={visible ? "Hide on-screen identity tags" : "Show on-screen identity tags"}
        >
          {visible ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
          {visible ? "Hide tags" : "Show tags"}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex min-w-0 items-center gap-2 border-t border-white/10 bg-[#09090b] px-3 py-2 text-white ${variant === "compact" ? "overflow-x-auto" : "flex-wrap"} ${className}`}
      data-face-presence-rail
      aria-live="polite"
    >
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-white/45">On screen now</span>
      {visible ? tags.map((tag) => <IdentityChip key={tag.trackId} tag={tag} />) : (
        <span className="text-[10px] text-white/45">Identity tags hidden</span>
      )}
      <button
        type="button"
        onClick={toggleVisibility}
        className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-semibold text-white/55 ring-1 ring-inset ring-white/12 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-pressed={!visible}
      >
        {visible ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
