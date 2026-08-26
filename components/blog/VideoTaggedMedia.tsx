"use client";

import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Info, Tag as TagIcon } from "lucide-react";
import type { BboxKeyframe, FaceTrack, ResolvedPerson, VideoSegment } from "@/lib/blog";
import { MEMBERS_BY_SLUG } from "@/lib/members";

type Props = {
  src: string;
  poster?: string | null;
  caption?: string | null;
  tracks: FaceTrack[];
  className?: string;
  /**
   * When true, hovering a face box pauses the video — gives admins a stable
   * surface to tag against. Defaults off for the public reader.
   */
  pauseOnHover?: boolean;
};

const MAX_ACTIVE_BOXES = 6;
const MOBILE_REVEAL_MS = 4000;

type ActiveBox = {
  segmentId: string;
  /** Which track produced this box (so the popover knows the person). */
  track: FaceTrack;
  bbox: { left: number; top: number; width: number; height: number };
  /** Confidence used for the cap-by-priority sort. */
  priority: number;
};

/**
 * <VideoTaggedMedia> — public-side video player with face-tag boxes that
 * track each detected person across playback.
 *
 * Mechanics:
 *  - On every frame (`requestVideoFrameCallback` if supported, else `rAF`),
 *    we look up the current `currentTime` in each track's segments,
 *    interpolate the bbox between surrounding keyframes, and render a box
 *    overlay.
 *  - Capped at MAX_ACTIVE_BOXES — the top-confidence boxes win when more
 *    are simultaneously active.
 *  - Boxes invisible by default; reveal on hover/focus with a 2-stroke ring
 *    (white inner + accent outer) for AAA contrast on any frame.
 *  - Mobile "show tags" toggle pulses every box for 4s after each new face
 *    enters; second tap on a box opens its tooltip.
 *  - Reduced-motion: skip rAF entirely, render a static "tags by timestamp"
 *    list below the video as a fallback.
 *  - Native fullscreen player: skip rendering (no overlay support).
 */
export function VideoTaggedMedia({
  src,
  poster,
  caption,
  tracks,
  className,
  pauseOnHover = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<ActiveBox[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const revealTimer = useRef<number | null>(null);
  const lastSeen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    function onFs() {
      setIsFullscreen(document.fullscreenElement !== null);
    }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // ── per-frame active-segment lookup ────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (reducedMotion) return;
    if (isFullscreen) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    function tick(currentMs: number) {
      const next: ActiveBox[] = [];
      for (const track of tracks) {
        const seg = findActiveSegment(track.segments, currentMs);
        if (!seg) continue;
        const bbox = interpolateBbox(seg, currentMs);
        next.push({
          segmentId: seg.id,
          track,
          bbox,
          priority: seg.confidence ?? 0,
        });
      }

      // Cap to top-confidence MAX_ACTIVE_BOXES.
      next.sort((a, b) => b.priority - a.priority);
      const capped = next.slice(0, MAX_ACTIVE_BOXES);

      // Track newly-entered faces for the mobile pulse.
      const newKeys = capped.map((b) => b.segmentId);
      const last = lastSeen.current;
      const added = newKeys.some((k) => !last.has(k));
      if (added && revealed) {
        // Reset the auto-hide timer so a new face extends the pulse window.
        if (revealTimer.current) window.clearTimeout(revealTimer.current);
        revealTimer.current = window.setTimeout(() => setRevealed(false), MOBILE_REVEAL_MS);
      }
      lastSeen.current = new Set(newKeys);

      // Only update state when the active set actually changed.
      setActive((prev) => (sameKeys(prev, capped) ? prev : capped));
    }

    type Vid = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    const v = video as Vid;

    if (v.requestVideoFrameCallback) {
      let handle = 0;
      const loop = (_now: number, meta: { mediaTime: number }) => {
        if (cancelled) return;
        tick(meta.mediaTime * 1000);
        handle = v.requestVideoFrameCallback!(loop);
      };
      handle = v.requestVideoFrameCallback(loop);
      cleanup = () => {
        cancelled = true;
        v.cancelVideoFrameCallback?.(handle);
      };
    } else {
      let raf = 0;
      const loop = () => {
        if (cancelled) return;
        tick(v.currentTime * 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      cleanup = () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
    }

    return () => cleanup?.();
  }, [tracks, reducedMotion, isFullscreen, revealed]);

  function handleShowTags() {
    setRevealed(true);
    if (revealTimer.current) window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => setRevealed(false), MOBILE_REVEAL_MS);
  }

  const totalAppearances = useMemo(
    () => tracks.reduce((acc, t) => acc + t.segments.length, 0),
    [tracks],
  );

  return (
    <figure className={cn("video-tagged-media group relative", className)}>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-[color:var(--rule)] bg-black"
      >
        <video
          ref={videoRef}
          src={src}
          {...(poster ? { poster } : {})}
          controls
          preload="metadata"
          playsInline
          className="block w-full h-auto"
        />

        {!reducedMotion && !isFullscreen
          ? active.map((box) => (
              <FaceBox
                key={box.segmentId}
                box={box}
                revealed={revealed}
                onPauseHover={pauseOnHover ? () => videoRef.current?.pause() : undefined}
              />
            ))
          : null}

        {tracks.length > 0 && !isFullscreen ? (
          <span
            className="pointer-events-none absolute bottom-2 right-2 z-10 inline-flex h-5 items-center gap-1 rounded-full bg-black/70 px-2 font-mono text-xs uppercase tracking-[0.14em] text-white backdrop-blur-sm"
            aria-hidden="true"
          >
            <Info size={10} />
            {totalAppearances}
          </span>
        ) : null}
      </div>

      {/* Mobile "show tags" toggle. */}
      {tracks.length > 0 ? (
        <button
          type="button"
          onClick={handleShowTags}
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[color:var(--rule)] px-2 py-1 text-xs uppercase tracking-[0.08em] text-[color:var(--ink-dim)] transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)] md:hidden"
        >
          <TagIcon size={10} />
          {revealed ? "Tags showing…" : "Show tags"}
        </button>
      ) : null}

      {caption ? (
        <figcaption className="mt-2 text-center text-xs italic text-[color:var(--ink-dim)]">
          {caption}
        </figcaption>
      ) : null}

      {/* Reduced-motion fallback: list of "{Person} appears at 0:12 - 0:24". */}
      {reducedMotion && tracks.length > 0 ? (
        <details className="mt-3 rounded-lg border border-[color:var(--rule)] bg-[color:var(--surface)] p-3">
          <summary className="cursor-pointer text-xs text-[color:var(--ink-dim)]">
            Tags by timestamp ({totalAppearances})
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {tracks.flatMap((t) =>
              t.segments.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="text-[color:var(--ink)]">
                    {t.person?.name ?? "Unidentified"}
                  </span>
                  <span className="font-mono text-xs text-[color:var(--ink-faint)]">
                    {fmtTime(s.tStart)} → {fmtTime(s.tEnd)}
                  </span>
                </li>
              )),
            )}
          </ul>
        </details>
      ) : null}
    </figure>
  );
}

// ── FaceBox ────────────────────────────────────────────────────────────────

function FaceBox({
  box,
  revealed,
  onPauseHover,
}: {
  box: ActiveBox;
  revealed: boolean;
  onPauseHover?: () => void;
}) {
  const accent = accentFor(box.track.person);
  const label = box.track.person ? `Tagged: ${box.track.person.name}` : "Unidentified face";
  const style: React.CSSProperties = {
    left: `${box.bbox.left * 100}%`,
    top: `${box.bbox.top * 100}%`,
    width: `${box.bbox.width * 100}%`,
    height: `${box.bbox.height * 100}%`,
    "--face-accent": accent,
  } as React.CSSProperties;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          style={style}
          data-revealed={revealed ? "1" : "0"}
          onMouseEnter={onPauseHover}
          onFocus={onPauseHover}
          className={cn(
            "face-box absolute z-10 rounded-[2px] focus:outline-none",
            "border border-transparent",
            "hover:[box-shadow:inset_0_0_0_2px_#fff,0_0_0_2px_var(--face-accent)]",
            "focus-visible:[box-shadow:inset_0_0_0_2px_#fff,0_0_0_2px_var(--face-accent)]",
            "data-[revealed=1]:[box-shadow:inset_0_0_0_2px_#fff,0_0_0_2px_var(--face-accent)]",
            revealed && "animate-pulse-soft",
          )}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          sideOffset={4}
          className="z-50 w-[260px] rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-3 text-sm shadow-2xl outline-none"
        >
          {box.track.person ? (
            <PersonCard person={box.track.person} accent={accent} />
          ) : (
            <p className="text-xs text-[color:var(--ink-faint)]">Unidentified face.</p>
          )}
          <Popover.Arrow className="fill-[color:var(--bg-elev)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function PersonCard({ person, accent }: { person: ResolvedPerson; accent: string }) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    person.kind === "member" ? (
      <Link href={person.href.replace(/^\/m\//, "/about/") as never} className="block hover:opacity-90">
        {children}
      </Link>
    ) : person.kind === "external" && person.socials[0] ? (
      <a
        href={person.socials[0].url}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:opacity-90"
      >
        {children}
      </a>
    ) : (
      <div>{children}</div>
    );
  return (
    <Wrapper>
      <div className="flex items-start gap-2.5">
        <div
          className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border bg-[color:var(--surface)]"
          style={{ borderColor: accent }}
        >
          {person.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-mono text-xs uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
              {person.name.slice(0, 2)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-[color:var(--ink)]">{person.name}</span>
            <span className="font-mono text-xs uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">
              {person.kind}
            </span>
          </div>
          {person.socials[0] ? (
            <p className="mt-0.5 truncate text-xs text-[color:var(--ink-dim)]">
              {person.socials[0].platform} {person.socials[0].handle ?? ""}
            </p>
          ) : null}
        </div>
      </div>
    </Wrapper>
  );
}

// ── Segment lookup + bbox interpolation ────────────────────────────────────

function findActiveSegment(segments: VideoSegment[], currentMs: number): VideoSegment | null {
  // Binary search by tStart.
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid]!;
    if (currentMs < seg.tStart) hi = mid - 1;
    else if (currentMs >= seg.tEnd) lo = mid + 1;
    else return seg;
  }
  return null;
}

function interpolateBbox(seg: VideoSegment, currentMs: number) {
  const keys = seg.bboxKeyframes ?? [];
  if (keys.length === 0) return seg.bbox;
  if (keys.length === 1) return keys[0]!.bbox;

  // Find the surrounding keyframes.
  let prev: BboxKeyframe = keys[0]!;
  let next: BboxKeyframe = keys[keys.length - 1]!;
  for (let i = 0; i < keys.length - 1; i++) {
    if (currentMs >= keys[i]!.tMs && currentMs <= keys[i + 1]!.tMs) {
      prev = keys[i]!;
      next = keys[i + 1]!;
      break;
    }
  }
  const span = next.tMs - prev.tMs;
  const t = span > 0 ? Math.max(0, Math.min(1, (currentMs - prev.tMs) / span)) : 0;
  return {
    left: lerp(prev.bbox.left, next.bbox.left, t),
    top: lerp(prev.bbox.top, next.bbox.top, t),
    width: lerp(prev.bbox.width, next.bbox.width, t),
    height: lerp(prev.bbox.height, next.bbox.height, t),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sameKeys(a: ActiveBox[], b: ActiveBox[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.segmentId !== b[i]!.segmentId) return false;
    const ab = a[i]!.bbox;
    const bb = b[i]!.bbox;
    // Tolerate small bbox drift to skip re-renders.
    if (
      Math.abs(ab.left - bb.left) > 0.001 ||
      Math.abs(ab.top - bb.top) > 0.001 ||
      Math.abs(ab.width - bb.width) > 0.001 ||
      Math.abs(ab.height - bb.height) > 0.001
    ) {
      return false;
    }
  }
  return true;
}

function fmtTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function accentFor(person: ResolvedPerson | null): string {
  if (!person) return "var(--ink-dim)";
  if (person.kind === "member") {
    const slug = person.href.replace(/^\/(?:m|about)\//, "");
    const m = MEMBERS_BY_SLUG[slug];
    if (m) return m.accent;
  }
  if (person.kind === "external") return "var(--core)";
  return "var(--ink-dim)";
}

function cn(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}
