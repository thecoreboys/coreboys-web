"use client";

import { compactTitle } from "@/lib/watch/presentation";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { WatchItem } from "@/lib/watch/types";
import { MY_LIST_EVENT, readMyList, redirectToMyListSignIn, toggleMyList } from "@/lib/watch/mylist";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSubscription } from "@/hooks/useSubscription";
import { useWatchProgress, youtubeIdFromHref } from "@/hooks/useWatchProgress";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { contentShape, itemToPlayable } from "@/lib/watch/playable";
import { watchAttributionLabel } from "@/lib/watch/display-label";
import {
  bestWatchProgressMark,
  CONTINUE_WATCHING_MIN_SECONDS,
} from "@/lib/watch/continue-watching";
import { WatchThumb } from "./WatchThumb";

function formatPlaybackTime(seconds: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const remainder = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function uniqueBillboards(items: WatchItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function BillboardCarousel({ items, headingLevel = "h1" }: { items: WatchItem[]; headingLevel?: "h1" | "h2" }) {
  const slides = useMemo(() => uniqueBillboards(items), [items]);
  const [index, setIndex] = useState(0);
  const [focusPaused, setFocusPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const interactionPaused = focusPaused || hoverPaused;

  useEffect(() => {
    setIndex((current) => (slides.length ? current % slides.length : 0));
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2 || interactionPaused || reducedMotion) return;
    const active = slides[index] ?? slides[0];
    const delay = active?.kind === "live" || active?.format === "live" ? 30_000 : 12_000;
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [index, interactionPaused, reducedMotion, slides]);

  if (!slides.length) return null;
  const item = slides[index] ?? slides[0]!;

  return (
    <div
      className="watch-billboard-carousel"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusPaused(false);
        }
      }}
    >
      <div key={item.id} className="watch-billboard-slide">
        <Billboard item={item} headingLevel={headingLevel} />
      </div>

      {slides.length > 1 ? (
        <div className="watch-billboard-controls" aria-label="Featured videos and live channels">
          <Tooltip
            title="Previous feature"
            description="Show the previous featured video or live channel."
            placement="top"
          >
            <button
              type="button"
              className="watch-billboard-arrow"
              aria-label="Previous feature"
              onClick={() => setIndex((current) => (current - 1 + slides.length) % slides.length)}
            >
              <span aria-hidden>‹</span>
            </button>
          </Tooltip>
          <div className="watch-billboard-dots" role="tablist" aria-label="Featured rotation">
            {slides.map((slide, slideIndex) => (
              <Tooltip
                key={slide.id}
                title={slide.title}
                description="Jump directly to this featured title."
                placement="top"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={slideIndex === index}
                  aria-label={`Show ${slide.title}`}
                  className="watch-billboard-dot"
                  onClick={() => setIndex(slideIndex)}
                />
              </Tooltip>
            ))}
          </div>
          <Tooltip
            title="Next feature"
            description="Show the next featured video or live channel."
            placement="top"
          >
            <button
              type="button"
              className="watch-billboard-arrow"
              aria-label="Next feature"
              onClick={() => setIndex((current) => (current + 1) % slides.length)}
            >
              <span aria-hidden>›</span>
            </button>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}

export function Billboard({ item, headingLevel: Heading = "h1" }: { item: WatchItem; headingLevel?: "h1" | "h2" }) {
  const [saved, setSaved] = useState(false);
  const { map } = useWatchProgress();
  const player = usePlayer();
  const { user, loading: authLoading } = useAuth();
  const subscription = useSubscription();
  const dvrLoading = authLoading || subscription.loading;
  const dvrAllowed = subscription.hasFeature("dvr.extended_retention");
  const dvrLocked = Boolean(user && !dvrLoading && !dvrAllowed);
  const dvrSaved = dvrAllowed && saved;
  const playable = useMemo(() => itemToPlayable(item), [item]);
  const youtubeId = playable?.youtubeId ?? (item.platform === "youtube" ? youtubeIdFromHref(item.href) : null);
  const mark = bestWatchProgressMark(
    [item.id, youtubeId]
      .filter(Boolean)
      .map((ref) => map[ref as string]),
  );
  const progress = Math.min(1, Math.max(0, mark?.progress ?? 0));
  const live = item.kind === "live";
  const shape = contentShape(item);
  const fallbackOnly = !playable;
  const fallbackHref = item.sourceUrl || item.href;
  const resumable = !mark?.completed &&
    ((mark?.seconds ?? 0) >= CONTINUE_WATCHING_MIN_SECONDS || progress > 0.03);
  const watchedDuration = Math.max(0, mark?.durationSeconds ?? item.durationSeconds ?? 0);
  const watchedPosition = Math.min(
    watchedDuration || Number.POSITIVE_INFINITY,
    Math.max(0, mark?.positionSeconds ?? (watchedDuration * progress)),
  );
  const playbackTimeLabel = resumable && watchedDuration > 0
    ? `${formatPlaybackTime(watchedPosition)} / ${formatPlaybackTime(watchedDuration)}`
    : null;
  const action = item.format === "photo" ? "View" : live ? "Watch live" : resumable ? "Continue watching" : "Play";
  const titleSizeClass = item.title.length > 88
    ? "is-extra-long"
    : item.title.length > 54
      ? "is-long"
      : "";
  const playInPlayer = () => {
    if (!playable) return;
    player.play(item);
  };

  useEffect(() => {
    const sync = (event?: Event) => {
      const detail = (event as CustomEvent<string[]> | undefined)?.detail;
      const ids = Array.isArray(detail) ? detail : readMyList();
      setSaved(ids.includes(item.id));
    };
    sync();
    window.addEventListener(MY_LIST_EVENT, sync);
    return () => window.removeEventListener(MY_LIST_EVENT, sync);
  }, [item.id]);

  return (
    <header
      className={`watch-billboard is-${shape} is-platform-${item.platform}`}
      aria-labelledby="watch-billboard-title"
    >
      <div className="watch-billboard-media" aria-hidden>
        <WatchThumb
          youtubeId={youtubeId}
          src={item.backdrop || item.poster}
          className="watch-billboard-backfill"
          loading="eager"
          focalPoint={item.focalPoint}
        />
        <WatchThumb
          youtubeId={youtubeId}
          src={item.backdrop || item.poster}
          className="watch-billboard-primary"
          loading="eager"
          focalPoint={item.focalPoint}
        />
      </div>
      <div className="watch-billboard-veil" aria-hidden />

      {/* Provider players start after an intentional Play action in the main player. */}

      {playable ? (
        <button
          type="button"
          className="watch-billboard-surface-action"
          aria-label={`${action} ${item.title} in the media player`}
          onClick={playInPlayer}
        />
      ) : null}

      <div className="watch-billboard-copy relative z-10 w-full max-w-[56rem] px-5 pb-16 pt-32 md:px-10 md:pb-24">
        <p className="watch-billboard-kicker">
          {live ? <span className="watch-billboard-live">Live</span> : null}
          <span>{watchAttributionLabel(item)}</span>
        </p>
        <Heading
          id="watch-billboard-title"
          title={item.title}
          className={`watch-title ${titleSizeClass} mt-3 max-w-[52rem] break-words text-[color:var(--ink)]`}
        >
          {compactTitle(item.title, 84)}
        </Heading>

        {progress > 0 && !live ? (
          <div className="watch-billboard-progress-row">
            <div className="watch-billboard-progress" aria-label={`${Math.round(progress * 100)}% watched`}>
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            {playbackTimeLabel ? <span className="watch-billboard-progress-time">{playbackTimeLabel}</span> : null}
          </div>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href={(fallbackOnly ? fallbackHref : "#") as never}
            target={fallbackOnly && /^https?:\/\//i.test(fallbackHref) ? "_blank" : undefined}
            rel={fallbackOnly && /^https?:\/\//i.test(fallbackHref) ? "noopener noreferrer" : undefined}
            onClick={(event) => {
              if (!playable) return;
              event.preventDefault();
              playInPlayer();
            }}
            className="watch-billboard-play"
          >
            <span className="watch-billboard-play-icon" aria-hidden />
            {action}
          </Link>

          {item.memberSlug ? (
            <Link
              href={`/watch/network/${item.memberSlug}` as never}
              className="watch-billboard-details"
            >
              Details
            </Link>
          ) : null}

          <button
            type="button"
            aria-pressed={Boolean(user && dvrSaved)}
            aria-label={dvrLoading
              ? "Loading saved library"
              : user
                ? dvrLocked ? `Save with membership to save ${item.title}` : dvrSaved ? `Remove ${item.title} from your library` : `Add ${item.title} to your library`
                : `Add ${item.title} to your library`}
            aria-busy={dvrLoading}
            disabled={dvrLoading}
            onClick={() => {
              if (!user) {
                redirectToMyListSignIn();
                return;
              }
              if (!dvrAllowed) {
                window.location.assign(subscription.featureHref("dvr.extended_retention"));
                return;
              }
              setSaved(toggleMyList(item.id).includes(item.id));
            }}
            className="watch-billboard-list"
          >
            <span aria-hidden>{dvrSaved ? "✓" : "+"}</span>
            {dvrLoading ? "Loading…" : dvrLocked ? "Save with membership" : user && dvrSaved ? "Saved" : "Save"}
          </button>

        </div>
      </div>
    </header>
  );
}
