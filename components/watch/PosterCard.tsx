"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { FocusEvent } from "react";
import type { WatchItem } from "@/lib/watch/types";
import { MY_LIST_EVENT, readMyList, redirectToMyListSignIn, toggleMyList } from "@/lib/watch/mylist";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWatchProgress, youtubeIdFromHref } from "@/hooks/useWatchProgress";
import type { WatchMark } from "@/hooks/useWatchProgress";
import { DRAG_SCROLL_START_EVENT, type DragScrollStartDetail } from "@/hooks/useDragScroll";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { contentShape, embedFor, itemToPlayable } from "@/lib/watch/playable";
import { watchAttributionLabel } from "@/lib/watch/display-label";
import { shortFormPlatformLabel } from "@/lib/watch/short-form";
import type { WatchFeedbackValue } from "@/lib/watch/discovery-state";
import { HoverPreview } from "./HoverPreview";
import { WatchThumb } from "./WatchThumb";
import { DragScrollRail } from "./DragScrollRail";
import { WatchSelect } from "./WatchSelect";
import { useWatchContextMenu } from "./WatchContextMenu";

const warmedHoverEmbeds = new Set<string>();
const warmedHoverOrigins = new Set<string>();

/**
 * Warm the provider document during the short intentional-hover delay. The
 * actual preview remains unmounted until that delay passes, so it stays quiet
 * and provider UI never flashes, but its DNS/TLS/document work is already in
 * the browser cache when the preview opens.
 */
function prewarmHoverEmbed(item: WatchItem, startSeconds = 0) {
  if (typeof window === "undefined" || item.embeddable === false) return;
  if (item.previewStrategy === "external" || item.previewStrategy === "image") return;
  if (!(["youtube", "twitch", "tiktok", "instagram"] as string[]).includes(item.platform)) return;
  const playable = itemToPlayable(item);
  if (!playable) return;
  const src = embedFor(playable, {
    parent: window.location.hostname,
    origin: window.location.origin,
    muted: true,
    controls: false,
    autoplay: true,
    startSeconds,
  });
  if (!src) return;

  try {
    const origin = new URL(src).origin;
    if (!warmedHoverOrigins.has(origin)) {
      warmedHoverOrigins.add(origin);
      const connection = document.createElement("link");
      connection.rel = "preconnect";
      connection.href = origin;
      connection.crossOrigin = "anonymous";
      document.head.appendChild(connection);
    }
  } catch {
    // Invalid provider URLs are handled by the normal preview fallback.
  }

  if (warmedHoverEmbeds.has(src)) return;
  warmedHoverEmbeds.add(src);
  const documentHint = document.createElement("link");
  documentHint.rel = "prefetch";
  documentHint.as = "document";
  documentHint.href = src;
  document.head.appendChild(documentHint);
}

export function watchDisplayLabel(item: WatchItem) {
  return watchAttributionLabel(item);
}

export function MyListGlyph({ saved }: { saved: boolean }) {
  return saved ? (
    <svg viewBox="0 0 20 20" aria-hidden focusable="false">
      <path d="m4.2 10.3 3.5 3.5 8.1-8.1" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" aria-hidden focusable="false">
      <path d="M10 3.5v13M3.5 10h13" />
    </svg>
  );
}

export function PosterCard({
  item,
  rank,
  focused,
  context,
  feedback,
  onFeedback,
  activeQueueName,
  inActiveQueue = false,
  onToggleQueue,
  moment,
  hoverAutoplay = false,
  onPlay,
}: {
  item: WatchItem;
  rank?: number;
  focused?: boolean;
  context?: WatchItem[];
  feedback?: WatchFeedbackValue | null;
  onFeedback?: (item: WatchItem, value: WatchFeedbackValue | null) => void;
  activeQueueName?: string;
  inActiveQueue?: boolean;
  onToggleQueue?: (item: WatchItem) => void;
  moment?: { title: string; seconds: number };
  hoverAutoplay?: boolean;
  onPlay?: (item: WatchItem, context: readonly WatchItem[]) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewClosing, setPreviewClosing] = useState(false);
  const [previewKeyboard, setPreviewKeyboard] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const actionHovered = useRef(false);
  const previewRef = useRef(false);
  const previewKeyboardRef = useRef(false);
  const suppressKeyboardOpenRef = useRef(false);
  const restoreFocusFrame = useRef<number | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const reactId = useId();
  const previewPanelId = `watch-preview-${reactId.replace(/[^a-z0-9_-]/gi, "")}`;
  const { map, trackHover, markWatched } = useWatchProgress();
  const player = usePlayer();
  const contextMenu = useWatchContextMenu();
  const { user, loading: authLoading } = useAuth();
  const youtubeId = item.platform === "youtube" ? youtubeIdFromHref(item.href) : null;
  const refs = [item.id, youtubeId].filter(Boolean) as string[];
  const marks = refs.map((ref) => map[ref]);
  const progress = Math.min(1, Math.max(0, ...marks.map((mark) => mark?.progress ?? 0)));
  const done = marks.some((mark) => Boolean(mark?.completed));
  const playbackMark = marks
    .filter((mark): mark is WatchMark => Boolean(mark))
    .sort((left, right) => {
      const leftUpdated = Date.parse(left.positionUpdatedAt ?? "");
      const rightUpdated = Date.parse(right.positionUpdatedAt ?? "");
      if (Number.isFinite(leftUpdated) || Number.isFinite(rightUpdated)) {
        return (Number.isFinite(rightUpdated) ? rightUpdated : -Infinity) -
          (Number.isFinite(leftUpdated) ? leftUpdated : -Infinity);
      }
      return right.positionSeconds - left.positionSeconds;
    })[0];
  const durationSeconds = Math.max(
    0,
    item.durationSeconds ?? 0,
    ...marks.map((mark) => mark?.durationSeconds ?? 0),
  );
  const positionSeconds = done
    ? 0
    : Math.min(
        durationSeconds || Infinity,
        playbackMark && playbackMark.positionSeconds > 0
          ? playbackMark.positionSeconds
          : durationSeconds * progress,
      );
  const shape = contentShape(item);
  const isPhoto = item.format === "photo";
  const isInstagramPhoto = isPhoto && item.platform === "instagram";
  const isExternalPost = item.kind === "post";
  const live = item.kind === "live" || item.format === "live";
  const shortSourceLabel = shortFormPlatformLabel(item);
  const playable = isPhoto ? null : itemToPlayable(item);
  const fallbackHref = item.sourceUrl || item.href;
  previewRef.current = preview;
  previewKeyboardRef.current = previewKeyboard;

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

  useEffect(
    () => () => {
      if (openTimer.current) window.clearTimeout(openTimer.current);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      if (restoreFocusFrame.current != null) window.cancelAnimationFrame(restoreFocusFrame.current);
    },
    [],
  );

  useEffect(() => {
    const dismissForRailDrag = (event: Event) => {
      const { scroller } = (event as CustomEvent<DragScrollStartDetail>).detail;
      if (!cardRef.current || !scroller?.contains(cardRef.current)) return;
      if (openTimer.current) window.clearTimeout(openTimer.current);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      openTimer.current = null;
      closeTimer.current = null;
      if (!previewRef.current) return;
      setPreviewClosing(true);
      closeTimer.current = window.setTimeout(() => {
        setPreview(false);
        setPreviewClosing(false);
        setPreviewKeyboard(false);
        closeTimer.current = null;
      }, 230);
    };
    window.addEventListener(DRAG_SCROLL_START_EVENT, dismissForRailDrag);
    return () => window.removeEventListener(DRAG_SCROLL_START_EVENT, dismissForRailDrag);
  }, []);

  function cancelClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    if (preview) setPreviewClosing(false);
  }

  function cancelPreviewOpen() {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    openTimer.current = null;
  }

  function enterCardAction() {
    actionHovered.current = true;
    cancelPreviewOpen();
  }

  function leaveCardAction() {
    actionHovered.current = false;
  }

  function hasCardActionHover() {
    return actionHovered.current || Boolean(
      cardRef.current?.querySelector(
        ".watch-poster-save:hover, .watch-poster-more:hover, .watch-poster-feedback-menu:hover",
      ),
    );
  }

  function tuneStation() {
    window.dispatchEvent(new CustomEvent("core:watch-station", {
      detail: { memberSlug: item.memberSlug, title: watchDisplayLabel(item) },
    }));
  }

  function showPreview(keyboard = false) {
    cancelClose();
    // The Watch accessibility panel can stop previews entirely. Check at the
    // moment a card is entered so the preference takes effect without a reload.
    if (document.documentElement.dataset.watchAutoplay === "off") return;
    if (keyboard && suppressKeyboardOpenRef.current) {
      suppressKeyboardOpenRef.current = false;
      return;
    }
    if (isExternalPost && item.platform !== "x") return;
    if (
      !keyboard &&
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      return;
    }
    if (preview || openTimer.current || hasCardActionHover()) return;
    // Start warming the provider before the hover delay finishes, so the
    // visible iframe can render nearly immediately once it is allowed open.
    prewarmHoverEmbed(item, moment?.seconds ?? positionSeconds);
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      if (
        hasCardActionHover() ||
        cardRef.current?.closest("[data-drag-scroll-active='true']")
      ) return;
      setPreviewClosing(false);
      setPreviewKeyboard(keyboard);
      setPreview(true);
      trackHover(item.id, item.kind, item.memberSlug);
      if (youtubeId && youtubeId !== item.id) {
        trackHover(youtubeId, "youtube", item.memberSlug);
      }
    }, keyboard ? 140 : 380);
  }

  function hidePreview() {
    cancelPreviewOpen();
    if (!preview) return;
    cancelClose();
    setPreviewClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setPreview(false);
      setPreviewClosing(false);
      setPreviewKeyboard(false);
      closeTimer.current = null;
    }, 230);
  }

  function dismissKeyboardPreview() {
    cancelPreviewOpen();
    cancelClose();
    setPreview(false);
    setPreviewClosing(false);
    setPreviewKeyboard(false);
    if (restoreFocusFrame.current != null) window.cancelAnimationFrame(restoreFocusFrame.current);
    restoreFocusFrame.current = window.requestAnimationFrame(() => {
      restoreFocusFrame.current = null;
      const focusTarget = cardRef.current?.querySelector<HTMLElement>(".watch-poster-link");
      if (!focusTarget) return;
      suppressKeyboardOpenRef.current = true;
      focusTarget.focus({ preventScroll: true });
    });
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    const relatedTarget = event.relatedTarget as Node | null;
    if (event.currentTarget.contains(relatedTarget)) return;
    if (relatedTarget && document.getElementById(previewPanelId)?.contains(relatedTarget)) return;
    hidePreview();
  }

  function openContentMenu(event: {
    clientX: number;
    clientY: number;
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    if (!contextMenu) return;
    event.preventDefault();
    event.stopPropagation();
    contextMenu.open(event, { type: "content", item, context, moment });
  }

  return (
    <article
      ref={cardRef}
      className={`watch-poster group/poster is-${shape} is-platform-${item.platform} ${item.format === "photo" ? "is-photo" : ""} ${live ? "is-live" : ""} ${focused ? "is-focus" : ""} ${preview ? "is-preview-open" : ""} ${previewClosing ? "is-preview-closing" : ""} ${done ? "is-watched" : ""}`}
      onMouseEnter={() => {
        tuneStation();
        showPreview(false);
      }}
      onMouseLeave={() => {
        if (!previewKeyboardRef.current) hidePreview();
      }}
      onFocusCapture={() => {
        tuneStation();
        showPreview(true);
      }}
      onBlurCapture={handleBlur}
      /* Some embedded/card layers swallow `contextmenu`; pointer events still
         identify a secondary-button action before that happens. */
      onPointerDown={(event) => {
        if (event.button === 2) openContentMenu(event);
      }}
      onPointerUp={(event) => {
        if (event.button === 2) openContentMenu(event);
      }}
      onContextMenu={openContentMenu}
      onKeyDown={(event) => {
        if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
          if (!contextMenu) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          contextMenu.open({ clientX: rect.left + Math.min(rect.width / 2, 88), clientY: rect.top + Math.min(rect.height / 2, 88) }, { type: "content", item, context, moment });
          return;
        }
        if (event.key === "Escape") {
          setFeedbackOpen(false);
          hidePreview();
        }
      }}
    >
      {playable ? (
        <button
          type="button"
          className="watch-poster-link"
          aria-label={`${live ? "Watch live" : "Play"} ${item.title}`}
          onClick={() => {
            if (onPlay) {
              onPlay(item, context ?? [item]);
              return;
            }
            player.play(item, context, moment ? { startAtSeconds: moment.seconds } : undefined);
          }}
        >
          <WatchThumb
            youtubeId={youtubeId}
            src={item.poster}
            focalPoint={item.focalPoint}
          />
        </button>
      ) : (
        <Link
          href={fallbackHref as never}
          className="watch-poster-link"
          target={isInstagramPhoto || isExternalPost ? "_blank" : undefined}
          rel={isInstagramPhoto || isExternalPost ? "noopener noreferrer" : undefined}
          aria-label={isInstagramPhoto || isExternalPost
            ? `View ${item.title} on ${isExternalPost ? "X" : "Instagram"} (opens in a new tab)`
            : `Open ${item.title}`}
        >
          <WatchThumb
            youtubeId={youtubeId}
            src={item.poster}
            focalPoint={item.focalPoint}
          />
        </Link>
      )}

      {rank != null ? (
        <span className="watch-poster-rank" aria-hidden>
          {rank}
        </span>
      ) : null}

      {live ? <span className="watch-poster-live">Live</span> : null}

      {moment ? (
        <span className="watch-poster-moment">
          ↳ {moment.title} · {Math.floor(moment.seconds / 60)}:{String(Math.floor(moment.seconds % 60)).padStart(2, "0")}
        </span>
      ) : null}

      <div className="watch-poster-copy">
        <p className="line-clamp-2 watch-poster-title">{item.title}</p>
        <p className="watch-poster-member">
          {shortSourceLabel ? `${shortSourceLabel} · ${watchDisplayLabel(item)}` : watchDisplayLabel(item)}
        </p>
      </div>

      {progress > 0 || done ? (
        <span
          className="watch-progress"
          role="progressbar"
          aria-label={`${done ? "Watched" : "Watch progress"}: ${Math.round((done ? 1 : progress) * 100)}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((done ? 1 : progress) * 100)}
        >
          <i style={{ width: `${Math.round((done ? 1 : progress) * 100)}%` }} />
        </span>
      ) : null}

      <Tooltip
        title={authLoading ? "Loading DVR" : user && saved ? "Remove from DVR" : "Add to DVR"}
        description={authLoading
          ? "Checking your saved titles."
          : user
            ? saved
              ? "Remove this title from your DVR."
              : "Add this title to your DVR so you can quickly find it later."
            : "Sign in to add this title to your DVR across your devices."}
        placement="top"
        isDisabled={authLoading}
      >
        <button
          type="button"
          data-no-drag
          aria-label={authLoading
            ? "Loading DVR"
            : user
              ? saved ? `Remove ${item.title} from DVR` : `Add ${item.title} to DVR`
              : `Add ${item.title} to DVR`}
          aria-pressed={Boolean(user && saved)}
          disabled={authLoading}
          onFocus={cancelPreviewOpen}
          onMouseEnter={enterCardAction}
          onMouseLeave={leaveCardAction}
          onPointerEnter={enterCardAction}
          onPointerLeave={leaveCardAction}
          onPointerDown={enterCardAction}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!user) {
              redirectToMyListSignIn();
              return;
            }
            setSaved(toggleMyList(item.id).includes(item.id));
          }}
          className="watch-poster-save"
        >
          <span className="watch-poster-save-icon"><MyListGlyph saved={saved} /></span>
          <span className="watch-poster-save-label" aria-hidden>
            {authLoading ? "Loading…" : user && saved ? "In DVR" : "Add to DVR"}
          </span>
        </button>
      </Tooltip>

      {(onFeedback && !isPhoto) || (onToggleQueue && activeQueueName) || (!isPhoto && !live && Boolean(playable)) ? (
        <>
          <Tooltip
            title="More actions"
            description="Like, hide, or organize this title."
            placement="top"
            isDisabled={feedbackOpen}
          >
            <button
              type="button"
              data-no-drag
              className="watch-poster-more"
              aria-label={`More actions for ${item.title}`}
              aria-expanded={feedbackOpen}
              onFocus={cancelPreviewOpen}
              onMouseEnter={enterCardAction}
              onMouseLeave={leaveCardAction}
              onPointerEnter={enterCardAction}
              onPointerLeave={leaveCardAction}
              onPointerDown={enterCardAction}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setFeedbackOpen((value) => !value);
              }}
            >
              <span aria-hidden>•••</span>
            </button>
          </Tooltip>
          {feedbackOpen ? (
            <div data-no-drag className="watch-poster-feedback-menu" role="group" aria-label={`Actions for ${item.title}`}>
              {onToggleQueue && activeQueueName ? (
                <button type="button" aria-pressed={inActiveQueue} onClick={() => { onToggleQueue(item); setFeedbackOpen(false); }}>
                  {inActiveQueue ? "✓" : "+"} <span>{inActiveQueue ? `In ${activeQueueName}` : `Add to ${activeQueueName}`}</span>
                </button>
              ) : null}
              {!isPhoto && !live && playable && !done ? (
                <button
                  type="button"
                  title="Completes the progress bar without adding watch time"
                  onClick={() => {
                    markWatched(item.id, item.kind, item.memberSlug, durationSeconds);
                    setFeedbackOpen(false);
                  }}
                >
                  ✓ <span>Mark as watched</span>
                </button>
              ) : null}
              {onFeedback && !isPhoto ? (
                <>
                  <button type="button" aria-pressed={feedback === "like"} onClick={() => { onFeedback(item, feedback === "like" ? null : "like"); setFeedbackOpen(false); }}>♥ <span>Like</span></button>
                  <button type="button" aria-pressed={feedback === "dislike"} onClick={() => { onFeedback(item, feedback === "dislike" ? null : "dislike"); setFeedbackOpen(false); }}>↓ <span>Less like this</span></button>
                  <button type="button" aria-pressed={feedback === "not_interested"} onClick={() => { onFeedback(item, "not_interested"); setFeedbackOpen(false); }}>× <span>Not interested</span></button>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {preview ? (
        <HoverPreview
          item={item}
          youtubeId={youtubeId}
          progress={progress}
          done={done}
          positionSeconds={positionSeconds}
          durationSeconds={durationSeconds}
          saved={saved}
          context={context}
          anchorRef={cardRef}
          active={!previewClosing}
          onPreviewEnter={cancelClose}
          onPreviewLeave={hidePreview}
          feedback={feedback}
          onFeedback={onFeedback}
          moment={moment}
          hoverAutoplay={hoverAutoplay}
          panelId={previewPanelId}
          keyboardActive={previewKeyboard}
          onKeyboardDismiss={dismissKeyboardPreview}
        />
      ) : null}
    </article>
  );
}

export function MyListShelf({
  items,
  totalCount,
  signedIn,
  view,
  onViewChange,
  sort,
  onSortChange,
  feedback,
  onFeedback,
  activeQueueName,
  activeQueueItemIds,
  onToggleQueue,
  loading = false,
  page = false,
}: {
  items: WatchItem[];
  totalCount: number;
  signedIn: boolean;
  view: "all" | "unwatched" | "progress" | "watched";
  onViewChange: (value: "all" | "unwatched" | "progress" | "watched") => void;
  sort: "recent" | "title" | "progress";
  onSortChange: (value: "recent" | "title" | "progress") => void;
  feedback?: Record<string, { value: WatchFeedbackValue }>;
  onFeedback?: (item: WatchItem, value: WatchFeedbackValue | null) => void;
  activeQueueName?: string;
  activeQueueItemIds?: readonly string[];
  onToggleQueue?: (item: WatchItem) => void;
  loading?: boolean;
  page?: boolean;
}) {
  const hasSavedItems = totalCount > 0;
  const Heading = page ? "h1" : "h2";
  return (
    <section className="watch-my-list-section px-5 md:px-10" aria-labelledby="my-list-title">
      <div className="watch-my-list-shell mx-auto max-w-[1600px]">
        <div className="watch-my-list-heading">
          <div>
            <p className="watch-my-list-eyebrow">Your personal recordings</p>
            <div className="watch-my-list-title-row">
              <Heading id="my-list-title">DVR</Heading>
              {hasSavedItems ? <span>{totalCount}</span> : null}
            </div>
            <p>
              {loading
                ? "Loading your DVR…"
                : signedIn
                ? "Saved with watch progress and ready to resume on every device."
                : "Sign in to build a DVR that stays with your CORE account."}
            </p>
          </div>
          {hasSavedItems ? (
            <Link href="/#latest" className="watch-my-list-browse">Browse Watch</Link>
          ) : null}
        </div>

        <div className="watch-my-list-controls" aria-label="Filter and sort DVR">
          <div>
            {(["all", "unwatched", "progress", "watched"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={view === value} onClick={() => onViewChange(value)}>
                {value === "all" ? "All" : value === "progress" ? "In progress" : value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <div className="watch-my-list-sort">
            <span>Sort</span>
            <WatchSelect
              ariaLabel="Sort DVR"
              value={sort}
              onChange={(value) => onSortChange(value as typeof sort)}
              options={[
                { id: "recent", label: "Recently added" },
                { id: "title", label: "Title A–Z" },
                { id: "progress", label: "Watch progress" },
              ]}
            />
          </div>
        </div>

        {items.length ? (
          <DragScrollRail className="watch-shelf watch-my-list-shelf" tabIndex={0} aria-label="DVR titles">
            {items.map((item) => (
              <PosterCard
                key={item.id}
                item={item}
                context={items}
                feedback={feedback?.[item.id]?.value}
                onFeedback={onFeedback}
                activeQueueName={activeQueueName}
                inActiveQueue={activeQueueItemIds?.includes(item.id)}
                onToggleQueue={onToggleQueue}
              />
            ))}
          </DragScrollRail>
        ) : (
          <div className="watch-my-list-empty">
            <span className="watch-my-list-empty-icon" aria-hidden>
              <MyListGlyph saved={false} />
            </span>
            <div>
              <h3>{loading ? "Loading your DVR" : hasSavedItems ? "Nothing here matches your filters" : "Your DVR starts here"}</h3>
              <p>
                {loading
                  ? "Checking your CORE account for saved titles."
                  : hasSavedItems
                  ? "Switch back to All to see every saved title."
                  : "Use Add to DVR on any video, stream, replay, short, or photo."}
              </p>
            </div>
            {loading ? null : hasSavedItems ? (
              <button type="button" className="watch-my-list-browse" onClick={() => onViewChange("all")}>Show everything</button>
            ) : (
              <Link href="/#latest">Browse Watch</Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function Shelf({
  title,
  items,
  variant = "standard",
  numbered,
  focusIndex,
  feedback,
  onFeedback,
  moments,
  hoverAutoplay = false,
}: {
  title: string;
  kicker?: string;
  items: WatchItem[];
  variant?: "standard" | "vertical" | "photo";
  numbered?: boolean;
  focusIndex?: number;
  feedback?: Record<string, { value: WatchFeedbackValue }>;
  onFeedback?: (item: WatchItem, value: WatchFeedbackValue | null) => void;
  moments?: Record<string, { title: string; seconds: number } | undefined>;
  hoverAutoplay?: boolean;
}) {
  if (items.length === 0) return null;
  // A rail is a content-format surface, not a creator surface. When the user
  // filters a creator row down to only Shorts or Photos, it must inherit the
  // same geometry as the house-wide Shorts/Photos rail instead of retaining
  // whatever mixed-content dimensions the row had before filtering.
  const resolvedVariant = variant !== "standard"
    ? variant
    : items.every((item) => item.format === "photo")
      ? "photo"
      : items.every((item) => item.format === "short" || item.orientation === "portrait")
        ? "vertical"
        : "standard";
  return (
    <section className={`watch-shelf-section px-5 md:px-10 ${resolvedVariant === "vertical" ? "is-vertical" : ""} ${resolvedVariant === "photo" ? "is-photo-shelf" : ""}`}>
      <div className="watch-shelf-heading mb-3 flex items-baseline gap-3">
        <h2 className="watch-shelf-title text-lg font-semibold tracking-tight text-[color:var(--ink)] md:text-xl">{title}</h2>
        {/* Section headings stay intentionally quiet. Source/platform copy is
            available in cards and filters, not beside every title. */}
      </div>
      <DragScrollRail className="watch-shelf" tabIndex={0} aria-label={title}>
        {items.map((item, index) => (
          <PosterCard
            key={item.id}
            item={item}
            context={items}
            rank={numbered ? index + 1 : undefined}
            focused={focusIndex === index}
            feedback={feedback?.[item.id]?.value}
            onFeedback={onFeedback}
            moment={moments?.[item.id]}
            hoverAutoplay={hoverAutoplay}
          />
        ))}
      </DragScrollRail>
    </section>
  );
}
