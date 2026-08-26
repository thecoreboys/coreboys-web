import type {
  MediaOrientation,
  XFeedEntities,
  XFeedEntity,
} from "@/components/feed/types";
import { GROUP } from "@/lib/group";
import type { WatchCatalog, WatchItem } from "./types";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 48;
const DEFAULT_PER_MEMBER = 2;
const MAX_PER_MEMBER = 8;
const FALLBACK_ACCENT = "#db0368";
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

export type WatchHomeXPostMedia = {
  id: string;
  kind: "image" | "video";
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  orientation: MediaOrientation;
  width: number | null;
  height: number | null;
};

export type WatchHomeXPostEntity = {
  start: number;
  end: number;
  kind: "url" | "mention" | "hashtag" | "cashtag";
  href: string;
  label?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
};

/**
 * Serializable, render-safe view of a member X post. `text` is plain text;
 * this contract intentionally has no HTML/embed field. Consumers should render
 * it as a React text child and link through `sourceUrl`.
 */
export type WatchHomeXPost = {
  id: string;
  statusId: string;
  text: string;
  sourceUrl: string;
  publishedAt: string;
  author: {
    slug: string;
    label: string;
    handle: string;
    portrait: string;
    profileUrl: string;
    accent: string;
    verified: boolean;
  };
  media: WatchHomeXPostMedia[];
  entities: WatchHomeXPostEntity[];
  quote?: {
    statusId: string;
    statusUrl: string;
    text: string;
    authorName?: string;
    authorHandle: string;
    authorProfileUrl: string;
    authorAvatarUrl?: string;
    imageUrl?: string;
  };
};

export type WatchHomeXPostOptions = {
  /** Total cards returned. Clamped to 0..48. */
  limit?: number;
  /** Maximum cards from one member. Clamped to 1..8. */
  perMember?: number;
};

export type WatchHomeXSpace = {
  id: string;
  spaceId: string;
  title: string;
  sourceUrl: string;
  startedAt: string | null;
  author: WatchHomeXPost["author"];
};

type XPostCatalog = Pick<WatchCatalog, "byMember" | "byPlatform">;

type ParsedStatus = {
  statusId: string;
  handle: string;
  sourceUrl: string;
};

type MutablePost = WatchHomeXPost & {
  mediaKeys: Set<string>;
};

function integerInRange(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function timestamp(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function newestFirst(a: WatchHomeXPost, b: WatchHomeXPost): number {
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id);
}

function isForbiddenControl(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    code <= 0x08 ||
    code === 0x0b ||
    code === 0x0c ||
    (code >= 0x0e && code <= 0x1f) ||
    code === 0x7f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/** Strip only unsafe controls and retain all post whitespace and visible text. */
function sanitizePostText(value: string): { text: string; offsets: number[] } {
  const offsets = new Array<number>(value.length + 1).fill(0);
  let sourceOffset = 0;
  let cleanOffset = 0;
  let text = "";
  for (const character of value) {
    for (let unit = 0; unit < character.length; unit += 1) {
      offsets[sourceOffset + unit] = cleanOffset;
    }
    if (!isForbiddenControl(character)) {
      text += character;
      cleanOffset += character.length;
    }
    sourceOffset += character.length;
    offsets[sourceOffset] = cleanOffset;
  }
  return { text, offsets };
}

function identityText(value: string | undefined): string | null {
  if (!value) return null;
  const clean = sanitizePostText(value).text.trim();
  return clean || null;
}

function safeAccent(value: string): string {
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value) ? value : FALLBACK_ACCENT;
}

function safePortrait(value: string): string {
  const trimmed = value.trim();
  if (/^\/(?!\/)[^\u0000-\u001F]*$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : "/embed-preview.png";
  } catch {
    return "/embed-preview.png";
  }
}

function safeHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Accept only canonical X/Twitter status permalinks. Media suffixes are
 * intentionally discarded so one four-photo tweet becomes one home card.
 */
function parseXStatus(value: string | undefined): ParsedStatus | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || (hostname !== "x.com" && hostname !== "twitter.com")) {
      return null;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const statusIndex = parts.findIndex((part) => part.toLowerCase() === "status");
    const handle = statusIndex > 0 ? parts[statusIndex - 1] ?? "" : "";
    const statusId = statusIndex >= 0 ? parts[statusIndex + 1] ?? "" : "";
    if (!X_HANDLE_RE.test(handle) || !/^\d{5,25}$/.test(statusId)) return null;
    return {
      statusId,
      handle: `@${handle}`,
      sourceUrl: `https://x.com/${handle}/status/${statusId}`,
    };
  } catch {
    return null;
  }
}

function statusOf(item: WatchItem): ParsedStatus | null {
  // X Spaces and any future live transport are never tweet cards.
  if (
    item.platform !== "x" ||
    item.kind === "live" ||
    item.format === "live" ||
    item.id.startsWith("x-space-")
  ) {
    return null;
  }
  return parseXStatus(item.sourceUrl) ?? parseXStatus(item.href);
}

function mediaOf(item: WatchItem): WatchHomeXPostMedia | null {
  // Text-only posts inherit the member portrait as their WatchItem poster;
  // do not misrepresent that fallback portrait as attached tweet media.
  if (item.kind === "post" && !item.mediaUrl) return null;

  const mediaUrl = safeHttpsUrl(item.mediaUrl);
  const thumbnailUrl = safeHttpsUrl(item.poster);
  if (!mediaUrl && !thumbnailUrl) return null;
  const kind = item.kind === "tour" || item.format === "photo" ? "image" : "video";
  const width = Number.isFinite(item.width) && (item.width ?? 0) > 0 ? item.width! : null;
  const height = Number.isFinite(item.height) && (item.height ?? 0) > 0 ? item.height! : null;
  const inferredOrientation = height && width
    ? height > width * 1.12
      ? "portrait"
      : width > height * 1.12
        ? "landscape"
        : "square"
    : kind === "image"
      ? "square"
      : "landscape";
  // The upstream width/height fields are more reliable than a legacy
  // orientation label. They let the first-party X card preserve the real
  // photo or video frame instead of forcing every attachment into 16:9.
  const orientation = width && height ? inferredOrientation : item.orientation ?? inferredOrientation;
  return {
    id: item.id,
    kind,
    thumbnailUrl,
    mediaUrl,
    orientation,
    width,
    height,
  };
}

function handleFromLabel(value: string | undefined): string | null {
  const match = /(?:^|\s)@([A-Za-z0-9_]{1,15})(?:\s|$)/.exec(value ?? "");
  return match?.[1] ? `@${match[1]}` : null;
}

function normalizedHandle(value: string | undefined): string | null {
  const handle = value?.trim().replace(/^@+/, "") ?? "";
  return X_HANDLE_RE.test(handle) ? `@${handle}` : null;
}

function profileUrlFor(handle: string): string {
  return `https://x.com/${handle.replace(/^@/, "")}`;
}

function entityRangeLooksRight(
  value: string,
  entity: XFeedEntity,
  kind: WatchHomeXPostEntity["kind"],
): boolean {
  if (!value) return false;
  if (kind === "url") return /^https?:\/\//i.test(value);
  if (kind === "mention") {
    const username = typeof entity.username === "string" ? entity.username : "";
    return /^@[A-Za-z0-9_]{1,15}$/.test(value) && (
      !username || value.slice(1).toLowerCase() === username.toLowerCase()
    );
  }
  const sigil = kind === "hashtag" ? "#" : "$";
  const tag = typeof entity.tag === "string" ? entity.tag : "";
  return value.startsWith(sigil) && (!tag || value.slice(1).toLowerCase() === tag.toLowerCase());
}

/** Resolve X entity indices whether the response counts UTF-16 units or code points. */
function sourceRange(
  text: string,
  entity: XFeedEntity,
  kind: WatchHomeXPostEntity["kind"],
): { start: number; end: number } | null {
  const start = entity.start;
  const end = entity.end;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start! < 0 || end! <= start!) {
    return null;
  }
  if (end! <= text.length) {
    const utf16 = text.slice(start, end);
    if (entityRangeLooksRight(utf16, entity, kind)) return { start: start!, end: end! };
  }
  const points = Array.from(text);
  if (end! > points.length) return null;
  const pointStart = points.slice(0, start).join("").length;
  const pointEnd = pointStart + points.slice(start, end).join("").length;
  const codePoints = text.slice(pointStart, pointEnd);
  return entityRangeLooksRight(codePoints, entity, kind)
    ? { start: pointStart, end: pointEnd }
    : null;
}

function entityTarget(
  entity: XFeedEntity,
  kind: WatchHomeXPostEntity["kind"],
): string | null {
  if (kind === "url") {
    return (
      safeHttpsUrl(typeof entity.unwound_url === "string" ? entity.unwound_url : undefined) ??
      safeHttpsUrl(typeof entity.expanded_url === "string" ? entity.expanded_url : undefined) ??
      safeHttpsUrl(typeof entity.url === "string" ? entity.url : undefined)
    );
  }
  if (kind === "mention") {
    const handle = normalizedHandle(
      typeof entity.username === "string" ? entity.username : undefined,
    );
    return handle ? profileUrlFor(handle) : null;
  }
  const tag = typeof entity.tag === "string" ? entity.tag.trim() : "";
  if (!tag || tag.length > 100 || /[\u0000-\u0020]/.test(tag)) return null;
  return kind === "hashtag"
    ? `https://x.com/hashtag/${encodeURIComponent(tag)}`
    : `https://x.com/search?q=${encodeURIComponent(`$${tag}`)}`;
}

function previewCopy(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = identityText(value);
  return clean ? clean.slice(0, maxLength) : undefined;
}

function entityPreview(entity: XFeedEntity, kind: WatchHomeXPostEntity["kind"]) {
  if (kind !== "url") return {};
  const image = Array.isArray(entity.images)
    ? entity.images.find((entry) => safeHttpsUrl(entry?.url))?.url
    : undefined;
  return {
    label: previewCopy(entity.display_url, 80),
    title: previewCopy(entity.title, 160),
    description: previewCopy(entity.description, 220),
    imageUrl: safeHttpsUrl(image) ?? undefined,
  };
}

function normalizedEntities(
  rawText: string,
  cleanOffsets: readonly number[],
  entities: XFeedEntities | undefined,
): WatchHomeXPostEntity[] {
  if (!entities) return [];
  const groups: Array<{
    kind: WatchHomeXPostEntity["kind"];
    values: XFeedEntity[] | undefined;
  }> = [
    { kind: "url", values: entities.urls },
    { kind: "mention", values: entities.mentions },
    { kind: "hashtag", values: entities.hashtags },
    { kind: "cashtag", values: entities.cashtags },
  ];
  const candidates = groups.flatMap(({ kind, values }) => (values ?? []).flatMap((entity) => {
    const range = sourceRange(rawText, entity, kind);
    const href = entityTarget(entity, kind);
    if (!range || !href) return [];
    const start = cleanOffsets[range.start];
    const end = cleanOffsets[range.end];
    if (!Number.isInteger(start) || !Number.isInteger(end) || end! <= start!) return [];
    return [{ start: start!, end: end!, kind, href, ...entityPreview(entity, kind) }];
  }));

  candidates.sort((left, right) => left.start - right.start || right.end - left.end);
  const accepted: WatchHomeXPostEntity[] = [];
  let cursor = -1;
  for (const candidate of candidates) {
    if (candidate.start < cursor) continue;
    accepted.push(candidate);
    cursor = candidate.end;
  }
  return accepted;
}

function postContent(item: WatchItem): Pick<WatchHomeXPost, "text" | "entities"> {
  const usesNote = typeof item.x?.noteText === "string";
  // Legacy per-media feed entries added this suffix themselves. Official
  // cached X DTOs carry the exact source text and must never be shortened.
  const rawText = usesNote
    ? item.x!.noteText!
    : item.x
      ? item.title
      : item.title.replace(/\s+·\s+\d+\/\d+$/, "");
  const clean = sanitizePostText(rawText);
  return {
    text: clean.text,
    entities: normalizedEntities(
      rawText,
      clean.offsets,
      usesNote ? item.x?.noteEntities : item.x?.entities,
    ),
  };
}

function quoteContent(item: WatchItem): WatchHomeXPost["quote"] | undefined {
  const quote = item.x?.quote;
  if (!quote) return undefined;
  const reference = parseXStatus(quote.statusUrl);
  const text = identityText(quote.text);
  const handle = normalizedHandle(quote.authorHandle);
  const profileUrl = safeHttpsUrl(quote.authorProfileUrl);
  if (!reference || !text || !handle || !profileUrl) return undefined;
  return {
    statusId: reference.statusId,
    statusUrl: reference.sourceUrl,
    text,
    authorName: identityText(quote.authorName) ?? undefined,
    authorHandle: handle,
    authorProfileUrl: profileUrl,
    authorAvatarUrl: safeHttpsUrl(quote.authorAvatarUrl) ?? undefined,
    imageUrl: safeHttpsUrl(quote.imageUrl) ?? undefined,
  };
}

/**
 * Select the Watch-home X rail from an already-fetched WatchCatalog.
 *
 * Selection happens in rounds (one newest post per configured account, then
 * a second, etc.) before the selected cards are sorted newest-first. That
 * keeps a busy account from starving the official CORE account or another
 * member without making the visible rail feel artificially ordered.
 */
export function selectWatchHomeXPosts(
  catalog: XPostCatalog,
  options: WatchHomeXPostOptions = {},
): WatchHomeXPost[] {
  const limit = integerInRange(options.limit, DEFAULT_LIMIT, 0, MAX_LIMIT);
  if (limit === 0) return [];
  const perMember = integerInRange(
    options.perMember,
    DEFAULT_PER_MEMBER,
    1,
    MAX_PER_MEMBER,
  );

  const configuredMembers = new Map(
    catalog.byMember.map((member, index) => [member.slug, { ...member, index }] as const),
  );
  const groupAuthor = {
    slug: "core",
    label: GROUP.name,
    accent: FALLBACK_ACCENT,
    portrait: "/brand/logo-core-black.png",
    index: -1,
  };
  const configuredAuthors = [groupAuthor, ...configuredMembers.values()];
  const groupHandle = GROUP.socials.x.handle.toLowerCase();
  const postsByStatus = new Map<string, MutablePost>();

  for (const item of catalog.byPlatform.x) {
    const memberSlug = item.memberSlug;
    const parsed = statusOf(item);
    const published = timestamp(item.publishedAt);
    if (!parsed || published === null) continue;
    const authorHandle =
      normalizedHandle(item.x?.authorHandle) ??
      handleFromLabel(item.accountLabel) ??
      parsed.handle;
    const author = memberSlug
      ? configuredMembers.get(memberSlug)
      : parsed.handle.toLowerCase() === groupHandle
        ? groupAuthor
        : undefined;
    if (!author) continue;
    const displayHandle = author === groupAuthor ? GROUP.socials.x.handle : authorHandle;

    const key = `${author.slug}:${parsed.statusId}`;
    const media = mediaOf(item);
    const existing = postsByStatus.get(key);
    if (existing) {
      if (media) {
        const mediaKey = `${media.mediaUrl ?? ""}|${media.thumbnailUrl ?? ""}`;
        if (!existing.mediaKeys.has(mediaKey)) {
          existing.mediaKeys.add(mediaKey);
          existing.media.push(media);
        }
      }
      continue;
    }

    const content = postContent(item);
    if (!content.text) continue;
    const mediaKeys = new Set<string>();
    if (media) mediaKeys.add(`${media.mediaUrl ?? ""}|${media.thumbnailUrl ?? ""}`);
    postsByStatus.set(key, {
      id: `x-${parsed.statusId}`,
      statusId: parsed.statusId,
      text: content.text,
      sourceUrl: parsed.sourceUrl,
      publishedAt: new Date(published).toISOString(),
      author: {
        slug: author.slug,
        label: identityText(item.x?.authorName) ?? author.label,
        handle: displayHandle,
        portrait: safePortrait(item.x?.authorAvatarUrl ?? author.portrait),
        profileUrl: profileUrlFor(displayHandle),
        accent: safeAccent(author.accent),
        verified: item.x?.verified === true,
      },
      media: media ? [media] : [],
      entities: content.entities,
      quote: quoteContent(item),
      mediaKeys,
    });
  }

  const queues = configuredAuthors
    .map((author) => ({
      author,
      posts: [...postsByStatus.values()]
        .filter((post) => post.author.slug === author.slug)
        .sort(newestFirst)
        .slice(0, perMember),
    }))
    .filter((entry) => entry.posts.length > 0)
    .sort((a, b) => newestFirst(a.posts[0]!, b.posts[0]!) || a.author.index - b.author.index);

  const selected: WatchHomeXPost[] = [];
  for (let round = 0; round < perMember && selected.length < limit; round += 1) {
    for (const queue of queues) {
      const post = queue.posts[round];
      if (!post) continue;
      // Remove the selector's private de-dupe set at the public boundary.
      const { mediaKeys: _mediaKeys, ...publicPost } = post;
      selected.push(publicPost);
      if (selected.length === limit) break;
    }
  }

  return selected.sort(newestFirst);
}

function parseXSpace(value: string | undefined): { spaceId: string; sourceUrl: string } | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || (host !== "x.com" && host !== "twitter.com")) return null;
    const match = /^\/i\/spaces\/([A-Za-z0-9_-]{6,40})\/?$/i.exec(url.pathname);
    return match?.[1] ? { spaceId: match[1], sourceUrl: `https://x.com/i/spaces/${match[1]}` } : null;
  } catch {
    return null;
  }
}

export function selectWatchHomeXSpaces(catalog: XPostCatalog, limit = 8): WatchHomeXSpace[] {
  const members = new Map(catalog.byMember.map((member) => [member.slug, member]));
  const seen = new Set<string>();
  const spaces: WatchHomeXSpace[] = [];
  for (const item of catalog.byPlatform.x) {
    if (item.kind !== "live" && item.format !== "live") continue;
    const reference = parseXSpace(item.sourceUrl) ?? parseXSpace(item.href);
    const member = item.memberSlug ? members.get(item.memberSlug) : undefined;
    if (!reference || !member || seen.has(reference.spaceId)) continue;
    seen.add(reference.spaceId);
    const published = timestamp(item.publishedAt);
    spaces.push({
      id: `x-space-${reference.spaceId}`,
      spaceId: reference.spaceId,
      title: sanitizePostText(item.title).text || `${member.label} is live on X Spaces`,
      sourceUrl: reference.sourceUrl,
      startedAt: published === null ? null : new Date(published).toISOString(),
      author: {
        slug: item.memberSlug!,
        label: member.label,
        handle: handleFromLabel(item.accountLabel) ?? "@x",
        portrait: safePortrait(member.portrait),
        profileUrl: profileUrlFor(handleFromLabel(item.accountLabel) ?? "@x"),
        accent: safeAccent(member.accent),
        verified: false,
      },
    });
  }
  return spaces
    .sort((left, right) => Date.parse(right.startedAt ?? "0") - Date.parse(left.startedAt ?? "0"))
    .slice(0, Math.max(0, Math.min(12, Math.trunc(limit))));
}
