"use client";

import { isRecentItem } from "@/lib/watch/presentation";

import { ExternalLink, Link2, MessageCircle, Mic2, Play, Radio } from "lucide-react";
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { PlatformLogo } from "@/components/clips/PlatformLogo";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
  kind: "youtube" | "link";
};

function linkLabel(entity: WatchHomeXPost["entities"][number]): string {
  if (/^https:\/\/t\.co\//i.test(entity.href)) return "Shared link";
  if (entity.label?.trim()) return entity.label.trim();
  try {
    const url = new URL(entity.href);
    const path = url.pathname.split("/").filter(Boolean)[0];
    return path ? `${url.hostname.replace(/^www\./, "")}/${path}` : url.hostname.replace(/^www\./, "");
  } catch {
    return "Open shared link";
  }
}

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

function xStatus(value: string): { id: string } | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com") return null;
    const match = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/i.exec(url.pathname);
    const id = match?.[2];
    return id ? { id } : null;
  } catch { return null; }
}

function linkPreviews(
  entities: readonly WatchHomeXPost["entities"][number][],
  sourceUrl: string,
  suppressStatusId?: string,
  hasMedia = false,
): LinkPreview[] {
  const seen = new Set<string>();
  return entities.flatMap<LinkPreview>((entity): LinkPreview[] => {
    if (entity.kind !== "url" || seen.has(entity.href) || entity.href === sourceUrl
      || isAttachedMediaLink(entity, sourceUrl, hasMedia)) return [];
    seen.add(entity.href);
    const videoId = youtubeId(entity.href);
    if (videoId) return [{
      href: entity.href, kind: "youtube" as const, label: "YouTube", title: entity.title ?? "Watch video",
      description: entity.description,
      imageUrl: entity.imageUrl ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    }];
    const quoted = xStatus(entity.href);
    if (quoted) {
      if (quoted.id === suppressStatusId) return [];
      // Quoted Post data is hydrated with the scheduled X snapshot and is
      // rendered below as a native nested card when available. If it was
      // imported without the quote payload,
      // retain the resolved X URL as a useful link preview instead of dropping
      // it and leaving only the original t.co token in the body.
    }
    try {
      const url = new URL(entity.href);
      return [{
        href: entity.href,
        kind: "link" as const,
        label: entity.label ?? (quoted ? "X" : url.hostname.replace(/^www\./, "")),
        title: entity.title ?? (quoted ? "Open linked post on X" : previewTitleFromUrl(url)),
        description: entity.description,
        imageUrl: entity.imageUrl,
      }];
    } catch { return []; }
  }).slice(0, 2);
}

function isAttachedMediaLink(entity: WatchHomeXPost["entities"][number], sourceUrl: string, hasMedia: boolean) {
  if (!hasMedia || entity.kind !== "url") return false;
  const linked = xStatus(entity.href);
  const source = xStatus(sourceUrl);
  return Boolean(linked && source && linked.id === source.id)
    || /^(?:https?:\/\/)?pic\.(?:x|twitter)\.com\//i.test(entity.label ?? entity.href);
}

function XPostText({
  text,
  entities,
  sourceUrl,
  hasMedia = false,
  suppressStatusId,
  className = styles.postText,
}: {
  text: string;
  entities: readonly WatchHomeXPost["entities"][number][];
  sourceUrl: string;
  hasMedia?: boolean;
  suppressStatusId?: string;
  className?: string;
}) {
  const content: ReactNode[] = [];
  let cursor = 0;
  let hasVisibleCopy = false;
  const previewUrls = new Set(linkPreviews(entities, sourceUrl, suppressStatusId, hasMedia).map((preview) => preview.href));

  for (const [index, entity] of entities.entries()) {
    if (
      entity.start < cursor ||
      entity.start < 0 ||
      entity.end <= entity.start ||
      entity.end > text.length
    ) {
      continue;
    }
    if (entity.start > cursor) {
      const copy = text.slice(cursor, entity.start);
      content.push(copy);
      hasVisibleCopy ||= Boolean(copy.trim());
    }
    if (entity.kind === "url") {
      // The card or attachment below already provides the accessible link.
      // Keep post copy readable instead of repeating shortened URLs above it.
      if (previewUrls.has(entity.href) || isAttachedMediaLink(entity, sourceUrl, hasMedia)
        || (suppressStatusId && xStatus(entity.href)?.id === suppressStatusId)) {
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
          {linkLabel(entity)}
        </a>,
      );
      hasVisibleCopy = true;
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
        {text.slice(entity.start, entity.end)}
      </a>,
    );
    hasVisibleCopy = true;
    cursor = entity.end;
  }

  if (cursor < text.length) {
    const copy = text.slice(cursor);
    content.push(copy);
    hasVisibleCopy ||= Boolean(copy.trim());
  }
  // Removing a trailing attachment/link must not leave several blank lines.
  while (typeof content.at(-1) === "string") {
    const tail = (content.at(-1) as string).trimEnd();
    if (tail) { content[content.length - 1] = tail; break; }
    content.pop();
  }
  return hasVisibleCopy ? <p className={className}>{content}</p> : null;
}

function XLinkPreviews({
  entities,
  sourceUrl,
  suppressStatusId,
  hasMedia = false,
  priority = false,
  className = styles.linkPreviews,
}: {
  entities: readonly WatchHomeXPost["entities"][number][];
  sourceUrl: string;
  suppressStatusId?: string;
  hasMedia?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const previews = linkPreviews(entities, sourceUrl, suppressStatusId, hasMedia);
  if (!previews.length) return null;
  return (
    <div className={className} aria-label="Links shared in this post">
      {previews.map((preview) => {
        const imageUrl = preview.imageUrl && !failedImages.includes(preview.imageUrl) ? preview.imageUrl : null;
        return (
        <a key={preview.href} className={styles.linkPreview} data-kind={preview.kind} data-has-image={Boolean(imageUrl)} href={preview.href} target="_blank" rel={EXTERNAL_REL}>
          {imageUrl ? (
            <span className={styles.linkPreviewVisual}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" loading={priority ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer"
                onError={() => setFailedImages((current) => current.includes(imageUrl) ? current : [...current, imageUrl])} />
              {preview.kind === "youtube" ? <span className={styles.linkPreviewVisualPlay} aria-hidden="true"><Play /></span> : null}
            </span>
          ) : (
            <span className={styles.linkPreviewIcon} aria-hidden="true">
              <Link2 />
            </span>
          )}
          <span className={styles.linkPreviewCopy}>
            <small>{preview.label}</small>
            <strong>{preview.title}</strong>
            {preview.description ? <em>{preview.description}</em> : null}
          </span>
          {preview.kind === "youtube" ? <Play className={styles.linkPreviewPlay} aria-hidden="true" /> : <ExternalLink className={styles.linkPreviewExternal} aria-hidden="true" />}
        </a>
      );})}
    </div>
  );
}

function XQuotePreview({
  quote,
  unavailableQuote,
}: {
  quote: WatchHomeXPost["quote"];
  unavailableQuote: WatchHomeXPost["unavailableQuote"];
}) {
  if (quote) {
    const media: Array<(typeof quote.media)[number] & { source: string }> = quote.media.flatMap((entry) => (
      entry.thumbnailUrl ? [{ ...entry, source: entry.thumbnailUrl }] : []
    ));
    const mediaCount = Math.min(4, media.length);
    const singleMedia = mediaCount === 1 ? media[0] : undefined;
    const singleMediaRatio = singleMedia?.width && singleMedia?.height
      ? `${singleMedia.width} / ${singleMedia.height}`
      : singleMedia?.orientation === "portrait"
        ? "9 / 16"
        : singleMedia?.orientation === "square"
          ? "1 / 1"
          : "16 / 9";
    return (
      <section className={styles.quoteCard} aria-label={`Quoted post from ${quote.authorName ?? quote.authorHandle}`}>
        <span className={styles.quoteLabel}>
          <MessageCircle aria-hidden="true" />
          Quoted post
        </span>
        <header className={styles.quoteHeader}>
          <a href={quote.authorProfileUrl} target="_blank" rel={EXTERNAL_REL} aria-label={`Open ${quote.authorName ?? quote.authorHandle} on X`}>
            {quote.authorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={quote.authorAvatarUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
            ) : <MessageCircle aria-hidden="true" />}
          </a>
          <span>
            <a href={quote.authorProfileUrl} target="_blank" rel={EXTERNAL_REL}>
              <strong>{quote.authorName ?? quote.authorHandle}</strong>
            </a>
            <a href={quote.authorProfileUrl} target="_blank" rel={EXTERNAL_REL}>{quote.authorHandle}</a>
          </span>
          <a href={quote.statusUrl} target="_blank" rel={EXTERNAL_REL} aria-label="View quoted post on X">
            <ExternalLink aria-hidden="true" />
          </a>
        </header>
        <XPostText text={quote.text} entities={quote.entities} sourceUrl={quote.statusUrl} hasMedia={media.length > 0}
          suppressStatusId={quote.statusId} className={styles.quoteText} />
        <XLinkPreviews
          entities={quote.entities}
          sourceUrl={quote.statusUrl}
          suppressStatusId={quote.statusId}
          hasMedia={quote.media.length > 0}
          className={styles.quoteLinks}
        />
        {media.length ? (
          <div
            className={styles.quoteMediaGrid}
            data-count={mediaCount}
            style={mediaCount === 1
              ? { "--x-quote-media-ratio": singleMediaRatio } as CSSProperties
              : undefined}
          >
            {media.slice(0, 4).map((entry, index) => (
              <a key={entry.id} href={quote.statusUrl} target="_blank" rel={EXTERNAL_REL} aria-label={`View quoted attachment ${index + 1} on X`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={entry.source} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                {entry.kind === "video" ? <span className={styles.quoteVideoBadge}><Play aria-hidden="true" /></span> : null}
              </a>
            ))}
          </div>
        ) : null}
      </section>
    );
  }
  if (!unavailableQuote) return null;
  return (
    <section className={styles.quoteUnavailable} aria-label="Quoted post unavailable">
      <MessageCircle aria-hidden="true" />
      <span><strong>Quoted post unavailable</strong><small>It may be deleted or protected.</small></span>
      <a href={unavailableQuote.statusUrl} target="_blank" rel={EXTERNAL_REL} aria-label="Try opening quoted post on X"><ExternalLink aria-hidden="true" /></a>
    </section>
  );
}

function XPostCard({ post, onOpen, priority = false }: { post: WatchHomeXPost; onOpen?: (post: WatchHomeXPost) => void; priority?: boolean }) {
  const { rootRef, isNew } = useSeenXPost(post.statusId);
  const visibleMedia = post.media.flatMap((media) => {
    const source = media.thumbnailUrl ?? (media.kind === "image" ? media.mediaUrl : null);
    return source ? [{ ...media, source }] : [];
  });

  return (
    <article
      ref={rootRef}
      className={styles.postCard}
      style={{ "--member-accent": post.author.accent } as CSSProperties}
      data-openable={onOpen ? "true" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={(event) => {
        if (!onOpen || (event.target instanceof Element && event.target.closest("a,button"))) return;
        onOpen(post);
      }}
      onKeyDown={(event) => {
        if (!onOpen || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onOpen(post);
      }}
    >
      {isNew && isRecentItem(post) ? <span className={styles.newBadge}>New</span> : null}
      <header className={styles.postHeader}>
        <a
          className={styles.avatarLink}
          href={post.author.profileUrl}
          target="_blank"
          rel={EXTERNAL_REL}
          aria-label={`Open ${post.author.label} on X`}
        >
          {post.author.portrait.includes("twimg.com/") ? (
            // The selector only permits Twimg URLs here; never fall back to a
            // CORE/member site portrait for an X identity.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.author.portrait} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          ) : <PlatformLogo platform="x" size={18} />}
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

      <XPostText text={post.text} entities={post.entities} sourceUrl={post.sourceUrl} hasMedia={visibleMedia.length > 0}
        suppressStatusId={post.quote?.statusId ?? post.unavailableQuote?.statusId} />

      <XQuotePreview quote={post.quote} unavailableQuote={post.unavailableQuote} />

      <XLinkPreviews
        entities={post.entities}
        sourceUrl={post.sourceUrl}
        suppressStatusId={post.quote?.statusId ?? post.unavailableQuote?.statusId}
        hasMedia={visibleMedia.length > 0}
        priority={priority}
      />

      {visibleMedia.length ? (
        <div
          className={styles.mediaGrid}
          data-count={Math.min(4, visibleMedia.length)}
          style={visibleMedia.length === 1 && visibleMedia[0]?.width && visibleMedia[0]?.height
            ? { "--x-media-ratio": `${visibleMedia[0].width} / ${visibleMedia[0].height}` } as CSSProperties
            : undefined}
          aria-label="Attached media"
        >
          {visibleMedia.slice(0, 4).map((media, index) => (
            <a
              className={styles.mediaTile}
              key={media.id}
              href={post.sourceUrl}
              target="_blank"
              rel={EXTERNAL_REL}
              aria-label={`View attached media ${index + 1} on X`}
            >
              {/* X image and video thumbnails are cached by the server. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media.source} alt="" loading={priority ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" />
              {media.kind === "video" ? <span className={styles.videoBadge}><i aria-hidden="true" /> Video</span> : null}
              {index === 3 && visibleMedia.length > 4 ? <span className={styles.moreMedia}>+{visibleMedia.length - 4}</span> : null}
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

function XPostModal({ post, onClose }: { post: WatchHomeXPost | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(post)} onOpenChange={(open) => { if (!open) onClose(); }}>
      {post ? (
        <DialogContent className="w-[min(42rem,calc(100vw-1.5rem))] max-h-[min(48rem,calc(100dvh-1.5rem))] overflow-y-auto bg-[color:var(--bg)] p-3 sm:p-5">
          <DialogTitle className="sr-only">Post from {post.author.label}</DialogTitle>
          <XPostCard post={post} priority />
        </DialogContent>
      ) : null}
    </Dialog>
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
 * First-party cards rendered from the shared roster snapshot. The browser
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
  const [selectedPost, setSelectedPost] = useState<WatchHomeXPost | null>(null);

  const creators = useMemo(() => {
    const seen = new Set<string>();
    return items.flatMap((post) => {
      if (seen.has(post.author.slug)) return [];
      seen.add(post.author.slug);
      return [{ slug: post.author.slug, label: post.author.label }];
    });
  }, [items]);
  // A refresh can remove the selected account from the bounded window.
  // Keep the rail usable even when that leaves only one author/filter.
  const activeCreator = creators.some((entry) => entry.slug === creator) ? creator : "all";
  const limit = Math.max(1, Math.min(48, Math.trunc(maxItems)));
  const posts = useMemo(() => items
    .filter((post) => activeCreator === "all" || post.author.slug === activeCreator)
    .slice(0, limit), [activeCreator, items, limit]);

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
          <button type="button" aria-pressed={activeCreator === "all"} onClick={() => setCreator("all")}>Everyone</button>
          {creators.map((entry) => (
            <button key={entry.slug} type="button" aria-pressed={activeCreator === entry.slug} onClick={() => setCreator(entry.slug)}>
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
              // Preserve the marker for downstream styling/tests; masonry
              // deliberately does not make featured posts span rows.
              data-featured={post.media.length > 0 && index % 7 === 0 ? "true" : undefined}
            >
              <XPostCard post={post} onOpen={setSelectedPost} priority={index < 6} />
            </div>
          ))}
        </div>
      ) : null}
      <XPostModal post={selectedPost} onClose={() => setSelectedPost(null)} />
    </section>
  );
}
