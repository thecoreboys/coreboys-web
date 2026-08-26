"use client";

import { ExternalLink, Link2, MessageCircle, Mic2, Play, Radio } from "lucide-react";
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { PlatformLogo } from "@/components/clips/PlatformLogo";
import { BrowserRelativeTime } from "@/components/ui/BrowserDateTime";
import { useSeenXPost } from "@/components/x/useSeenXPost";
import type { WatchHomeXPost, WatchHomeXSpace } from "@/lib/watch/x-posts";
import styles from "./XTweetsRail.module.css";

export type XTweetsRailProps = {
  items: readonly WatchHomeXPost[];
  spaces?: readonly WatchHomeXSpace[];
  title?: string;
  maxItems?: number;
  showHeading?: boolean;
};

const EXTERNAL_REL = "noopener noreferrer";

type LinkPreview = {
  href: string;
  title: string;
  label: string;
  description?: string;
  imageUrl?: string;
  avatarUrl?: string;
  kind: "youtube" | "x" | "link";
};

function previewTitleFromUrl(url: URL): string {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean).map((part) => {
    try { return decodeURIComponent(part).replace(/[-_]+/g, " "); } catch { return part; }
  });
  if (host === "twitch.tv" && parts[0]) return `Watch ${parts[0]} on Twitch`;
  if ((host === "x.com" || host === "twitter.com") && parts[0]) return `Post from @${parts[0]}`;
  if (host === "youtube.com" || host === "youtu.be") return "Watch on YouTube";
  return parts[0]
    ? `${host} · ${parts.slice(0, 2).join(" / ")}`
    : `Visit ${host}`;
}

function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (host !== "youtube.com" && host !== "m.youtube.com") return null;
    return url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{6,})/)?.[1] ?? null;
  } catch { return null; }
}

function xStatus(value: string): { handle: string; id: string } | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com") return null;
    const match = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/i.exec(url.pathname);
    const handle = match?.[1];
    const id = match?.[2];
    return handle && id ? { handle: `@${handle}`, id } : null;
  } catch { return null; }
}

function linkPreviews(post: WatchHomeXPost): LinkPreview[] {
  const seen = new Set<string>();
  return post.entities.flatMap<LinkPreview>((entity): LinkPreview[] => {
    if (entity.kind !== "url" || seen.has(entity.href) || entity.href === post.sourceUrl) return [];
    seen.add(entity.href);
    const videoId = youtubeId(entity.href);
    if (videoId) return [{
      href: entity.href, kind: "youtube" as const, label: "YouTube", title: entity.title ?? "Watch video",
      description: entity.description,
      imageUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    }];
    const quoted = xStatus(entity.href);
    if (quoted) {
      const quote = post.quote?.statusId === quoted.id ? post.quote : undefined;
      return [{
        href: quote?.statusUrl ?? entity.href,
        kind: "x" as const,
        label: "Quoted post",
        title: quote ? `${quote.authorName ?? quote.authorHandle} · ${quote.authorHandle}` : `Quote from ${quoted.handle}`,
        description: quote?.text,
        imageUrl: quote?.imageUrl,
        avatarUrl: quote?.authorAvatarUrl,
      }];
    }
    try {
      const url = new URL(entity.href);
      // An opaque t.co URL attached to a photo/video is already represented
      // by the gallery below; it is not useful as a duplicate website card.
      if (url.hostname.toLowerCase() === "t.co" && post.media.length) return [];
      return [{
        href: entity.href,
        kind: "link" as const,
        label: entity.label ?? url.hostname.replace(/^www\./, ""),
        title: entity.title ?? previewTitleFromUrl(url),
        description: entity.description,
        imageUrl: entity.imageUrl,
      }];
    } catch { return []; }
  }).slice(0, 2);
}

function XPostText({ post }: { post: WatchHomeXPost }) {
  const content: ReactNode[] = [];
  let cursor = 0;
  let hasVisibleCopy = false;

  for (const [index, entity] of post.entities.entries()) {
    if (
      entity.start < cursor ||
      entity.start < 0 ||
      entity.end <= entity.start ||
      entity.end > post.text.length
    ) {
      continue;
    }
    if (entity.start > cursor) {
      const copy = post.text.slice(cursor, entity.start);
      content.push(copy);
      hasVisibleCopy ||= Boolean(copy.trim());
    }
    if (entity.kind === "url") {
      // The rich attachment underneath is easier to scan than a raw t.co
      // address. Keep the surrounding copy and render the destination below.
      cursor = entity.end;
      continue;
    }
    content.push(
      <a
        key={`${entity.start}:${entity.end}:${index}`}
        href={entity.href}
        target="_blank"
        rel={EXTERNAL_REL}
      >
        {post.text.slice(entity.start, entity.end)}
      </a>,
    );
    hasVisibleCopy = true;
    cursor = entity.end;
  }

  if (cursor < post.text.length) {
    const copy = post.text.slice(cursor);
    content.push(copy);
    hasVisibleCopy ||= Boolean(copy.trim());
  }
  return hasVisibleCopy ? <p className={styles.postText}>{content}</p> : null;
}

function XLinkPreviews({ post }: { post: WatchHomeXPost }) {
  const previews = linkPreviews(post);
  if (!previews.length) return null;
  return (
    <div className={styles.linkPreviews} aria-label="Links shared in this post">
      {previews.map((preview) => (
        <a key={preview.href} className={styles.linkPreview} data-kind={preview.kind} href={preview.href} target="_blank" rel={EXTERNAL_REL}>
          {preview.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          ) : preview.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.linkPreviewAvatar} src={preview.avatarUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          ) : (
            <span className={styles.linkPreviewIcon} aria-hidden="true">
              {preview.kind === "x" ? <MessageCircle /> : <Link2 />}
            </span>
          )}
          <span className={styles.linkPreviewCopy}>
            <small>{preview.label}</small>
            <strong>{preview.title}</strong>
            {preview.description ? <em>{preview.description}</em> : null}
          </span>
          {preview.kind === "youtube" ? <Play className={styles.linkPreviewPlay} aria-hidden="true" /> : <ExternalLink className={styles.linkPreviewExternal} aria-hidden="true" />}
        </a>
      ))}
    </div>
  );
}

function XPostCard({ post }: { post: WatchHomeXPost }) {
  const { rootRef, isNew } = useSeenXPost(post.statusId);
  const visibleMedia = post.media.flatMap((media) => {
    const source = media.thumbnailUrl ?? (media.kind === "image" ? media.mediaUrl : null);
    return source ? [{ ...media, source }] : [];
  });
  const mediaCount = Math.min(4, visibleMedia.length);
  const singleMedia = mediaCount === 1 ? visibleMedia[0] : undefined;
  const fallbackRatio = singleMedia?.orientation === "portrait"
    ? "9 / 16"
    : singleMedia?.orientation === "square"
      ? "1 / 1"
      : "16 / 9";
  const singleMediaRatio = singleMedia?.width && singleMedia?.height
    ? `${singleMedia.width} / ${singleMedia.height}`
    : fallbackRatio;

  return (
    <article
      ref={rootRef}
      className={styles.postCard}
      style={{ "--member-accent": post.author.accent } as CSSProperties}
    >
      {isNew ? <span className={styles.newBadge}>New</span> : null}
      <header className={styles.postHeader}>
        <a
          className={styles.avatarLink}
          href={post.author.profileUrl}
          target="_blank"
          rel={EXTERNAL_REL}
          aria-label={`Open ${post.author.label} on X`}
        >
          {/* Cached profile metadata; this does not load an X widget or call the X API. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.author.portrait}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </a>
        <span className={styles.authorCopy}>
          <a href={post.author.profileUrl} target="_blank" rel={EXTERNAL_REL}>
            <strong>
              {post.author.label}
              {post.author.verified ? (
                <span className={styles.verified} aria-label="Verified account">✓</span>
              ) : null}
            </strong>
          </a>
          <a href={post.author.profileUrl} target="_blank" rel={EXTERNAL_REL}>
            {post.author.handle}
          </a>
        </span>
        <a
          className={styles.postMark}
          href={post.sourceUrl}
          target="_blank"
          rel={EXTERNAL_REL}
          aria-label={`View ${post.author.label}'s post on X`}
        >
          <PlatformLogo platform="x" size={16} />
        </a>
      </header>

      <XPostText post={post} />

      <XLinkPreviews post={post} />

      {visibleMedia.length ? (
        <div
          className={styles.mediaGrid}
          data-count={mediaCount}
          style={mediaCount === 1 ? { "--x-media-ratio": singleMediaRatio } as CSSProperties : undefined}
        >
          {visibleMedia.slice(0, 4).map((media, index) => (
            <a
              key={media.id}
              className={styles.mediaTile}
              data-orientation={media.orientation}
              href={post.sourceUrl}
              target="_blank"
              rel={EXTERNAL_REL}
              aria-label={`View attachment ${index + 1} from ${post.author.label}'s post on X`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media.source} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              {media.kind === "video" ? <span className={styles.videoBadge}><i aria-hidden="true" /> Video</span> : null}
              {index === 3 && visibleMedia.length > 4 ? (
                <span className={styles.moreMedia}>+{visibleMedia.length - 4}</span>
              ) : null}
            </a>
          ))}
        </div>
      ) : null}

      <footer className={styles.postFooter}>
        <a className={styles.timestamp} href={post.sourceUrl} target="_blank" rel={EXTERNAL_REL}>
          <BrowserRelativeTime value={post.publishedAt} fallback="Recent" />
        </a>
        <a
          className={styles.viewLink}
          href={post.sourceUrl}
          target="_blank"
          rel={EXTERNAL_REL}
          aria-label={`View ${post.author.label}'s post on X (opens in a new tab)`}
        >
          View on X <ExternalLink aria-hidden="true" />
        </a>
      </footer>
    </article>
  );
}

function XSpaceCard({ space }: { space: WatchHomeXSpace }) {
  return (
    <a
      className={styles.spaceCard}
      href={space.sourceUrl}
      target="_blank"
      rel={EXTERNAL_REL}
      style={{ "--member-accent": space.author.accent } as CSSProperties}
    >
      <span className={styles.spaceLive}><Radio aria-hidden="true" /> Live Space</span>
      <span className={styles.spaceIdentity}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={space.author.portrait} alt="" loading="lazy" />
        <span><strong>{space.author.label}</strong><small>{space.author.handle}</small></span>
      </span>
      <strong className={styles.spaceTitle}>{space.title}</strong>
      <span className={styles.spaceFooter}>
        <Mic2 aria-hidden="true" /> Listen on X
        {space.startedAt ? <BrowserRelativeTime value={space.startedAt} fallback="Now" /> : null}
        <ExternalLink aria-hidden="true" />
      </span>
    </a>
  );
}

/**
 * First-party cards rendered from the hourly roster snapshot. The browser
 * never loads X widgets or calls the X API; only an explicit profile/post link
 * navigates away from CORE.
 */
export function XTweetsRail({
  items,
  spaces = [],
  title = "On X",
  maxItems = 18,
  showHeading = true,
}: XTweetsRailProps) {
  const headingId = useId();
  const [creator, setCreator] = useState("all");

  const creators = useMemo(() => {
    const seen = new Set<string>();
    return items.flatMap((post) => {
      if (seen.has(post.author.slug)) return [];
      seen.add(post.author.slug);
      return [{ slug: post.author.slug, label: post.author.label }];
    });
  }, [items]);
  const limit = Math.max(1, Math.min(48, Math.trunc(maxItems)));
  const posts = useMemo(() => items
    .filter((post) => creator === "all" || post.author.slug === creator)
    .slice(0, limit), [creator, items, limit]);

  // Empty shelves behave like the other Watch rails. Never replace cached
  // content with a consent prompt or a browser-loaded provider timeline.
  if (!items.length && !spaces.length) return null;

  return (
    <section
      className={styles.section}
      aria-labelledby={showHeading ? headingId : undefined}
      aria-label={showHeading ? undefined : title}
    >
      {showHeading ? (
        <div className={styles.heading}>
          <h2 id={headingId}>{title}</h2>
        </div>
      ) : null}

      {spaces.length ? (
        <div className={styles.spaces} aria-label="Live X Spaces">
          {spaces.map((space) => <XSpaceCard key={space.id} space={space} />)}
        </div>
      ) : null}

      {creators.length > 1 ? (
        <div className={styles.filters} role="group" aria-label="Filter X posts by creator">
          <button type="button" aria-pressed={creator === "all"} onClick={() => setCreator("all")}>Everyone</button>
          {creators.map((entry) => (
            <button key={entry.slug} type="button" aria-pressed={creator === entry.slug} onClick={() => setCreator(entry.slug)}>
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}

      {posts.length ? (
        <div
          className={styles.grid}
          role="list"
          tabIndex={0}
          aria-labelledby={showHeading ? headingId : undefined}
          aria-label={showHeading ? undefined : title}
        >
          {posts.map((post, index) => (
            <div
              key={post.id}
              className={styles.cell}
              role="listitem"
              data-featured={post.media.length > 0 && index % 7 === 0 ? "true" : undefined}
            >
              <XPostCard post={post} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
