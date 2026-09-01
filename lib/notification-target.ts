import { playableFromUrl, type Playable } from "@/lib/watch/playable";

/**
 * A notification always keeps its canonical source URL in storage. This
 * client-safe resolver decides how that source should open in CORE without
 * rewriting or trusting the original provider link as an application route.
 */
export type NotificationRouteInput = {
  href: string;
  title?: string | null;
  body?: string | null;
  imageUrl?: string | null;
  avatarUrl?: string | null;
};

export type NotificationProvider = "core" | "twitch" | "youtube" | "tiktok" | "instagram" | "x" | "web";

export type NotificationTarget =
  | {
      kind: "theater";
      href: string;
      sourceHref: string;
      provider: Exclude<NotificationProvider, "core" | "web" | "x">;
    }
  | {
      kind: "preview";
      href: string;
      sourceHref: string;
      provider: Exclude<NotificationProvider, "core">;
    }
  | {
      kind: "link";
      href: string;
      sourceHref: string;
      provider: "core";
    };

export type NotificationPreviewData = {
  sourceHref: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  avatarUrl: string | null;
  provider: Exclude<NotificationProvider, "core">;
};

const MAX_TEXT_LENGTH = 500;
const MAX_URL_LENGTH = 2_000;
const CORE_HOSTS = new Set(["thecoreboys.com", "www.thecoreboys.com", "localhost", "127.0.0.1"]);

function compactText(value: string | null | undefined, maximum = MAX_TEXT_LENGTH): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maximum) : "";
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value || value.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeImageUrl(value: string | null | undefined): string | null {
  const source = safeHttpUrl(value);
  return source?.startsWith("https://") ? source : null;
}

function safeInternalPath(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed.slice(0, MAX_URL_LENGTH);
  const source = safeHttpUrl(trimmed);
  if (!source) return null;
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase();
    if (!CORE_HOSTS.has(host) && !host.endsWith(".thecoreboys.com")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function notificationProviderForUrl(value: string | null | undefined): NotificationProvider {
  const source = safeHttpUrl(value);
  if (!source) return "core";
  try {
    const host = new URL(source).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "twitch.tv" || host.endsWith(".twitch.tv")) return "twitch";
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "youtube";
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) return "x";
    return "web";
  } catch {
    return "web";
  }
}

export function notificationProviderLabel(provider: NotificationProvider): string {
  if (provider === "twitch") return "Twitch";
  if (provider === "youtube") return "YouTube";
  if (provider === "tiktok") return "TikTok";
  if (provider === "instagram") return "Instagram";
  if (provider === "x") return "X";
  if (provider === "core") return "CORE";
  return "the source";
}

function theaterHrefForPlayable(playable: Playable, sourceHref: string, title?: string | null): string {
  const reference = playable.youtubeId
    ?? playable.vodId
    ?? playable.clipId
    ?? playable.twitchLogin
    ?? playable.key;
  const query = new URLSearchParams({
    kind: playable.kind === "post" ? "clip" : playable.kind,
    id: reference,
    ref: playable.key,
    src: playable.clipSrc ?? playable.platform,
    url: sourceHref,
  });
  const displayTitle = compactText(title, 240);
  if (displayTitle) query.set("title", displayTitle);
  if (playable.memberSlug) query.set("slug", playable.memberSlug);
  if (playable.twitchLogin) query.set("login", playable.twitchLogin);
  if (playable.format) query.set("format", playable.format);
  if (playable.orientation) query.set("orientation", playable.orientation);
  return `/theater?${query.toString()}`;
}

function theaterHrefForWatchLive(path: string, title?: string | null): string | null {
  const match = /^\/watch\/live\/([^/?#]+)/i.exec(path);
  if (!match?.[1]) return null;
  let login = "";
  try { login = decodeURIComponent(match[1]).trim().toLowerCase(); } catch { return null; }
  if (!/^[a-z0-9_]{2,40}$/.test(login)) return null;
  const query = new URLSearchParams({ kind: "live", id: login, login, src: "twitch" });
  const displayTitle = compactText(title, 240);
  if (displayTitle) query.set("title", displayTitle);
  return `/theater?${query.toString()}`;
}

export function notificationPreviewHref(input: NotificationRouteInput, sourceHref?: string): string {
  const source = safeHttpUrl(sourceHref ?? input.href) ?? "/account/notifications";
  const query = new URLSearchParams({ url: source });
  const title = compactText(input.title, 240);
  const body = compactText(input.body);
  const image = safeImageUrl(input.imageUrl);
  const avatar = safeImageUrl(input.avatarUrl);
  if (title) query.set("title", title);
  if (body) query.set("body", body);
  if (image) query.set("image", image);
  if (avatar) query.set("avatar", avatar);
  return `/preview?${query.toString()}`;
}

/**
 * Resolve a durable inbox or push payload into a first-party destination.
 * Text/X posts intentionally return a preview, so no notification click
 * silently sends a viewer to X or another external site.
 */
export function notificationTargetFor(input: NotificationRouteInput): NotificationTarget {
  const href = input.href?.trim() ?? "";
  const internal = safeInternalPath(href);
  if (internal) {
    if (internal.startsWith("/theater?")) {
      return { kind: "theater", href: internal, sourceHref: internal, provider: "twitch" };
    }
    const liveTheater = theaterHrefForWatchLive(internal, input.title);
    if (liveTheater) return { kind: "theater", href: liveTheater, sourceHref: internal, provider: "twitch" };
    return { kind: "link", href: internal, sourceHref: internal, provider: "core" };
  }

  const sourceHref = safeHttpUrl(href);
  if (!sourceHref) return { kind: "link", href: "/account/notifications", sourceHref: "/account/notifications", provider: "core" };
  const provider = notificationProviderForUrl(sourceHref);
  if (provider === "core") {
    return { kind: "link", href: "/account/notifications", sourceHref, provider: "core" };
  }
  // X text is a document, rather than player media. Keep it within CORE until
  // the viewer explicitly chooses the later "Open on X" action.
  if (provider === "x" || provider === "web") {
    return { kind: "preview", href: notificationPreviewHref(input, sourceHref), sourceHref, provider };
  }

  const playable = playableFromUrl(sourceHref);
  if (playable) {
    return {
      kind: "theater",
      href: theaterHrefForPlayable(playable, sourceHref, input.title),
      sourceHref,
      provider,
    };
  }
  return { kind: "preview", href: notificationPreviewHref(input, sourceHref), sourceHref, provider };
}

export function notificationPreviewDataFromSearchParams(input: {
  url?: string | null;
  title?: string | null;
  body?: string | null;
  image?: string | null;
  avatar?: string | null;
}): NotificationPreviewData | null {
  const sourceHref = safeHttpUrl(input.url);
  if (!sourceHref) return null;
  const provider = notificationProviderForUrl(sourceHref);
  if (provider === "core") return null;
  return {
    sourceHref,
    title: compactText(input.title, 240) || `${notificationProviderLabel(provider)} update`,
    body: compactText(input.body) || null,
    imageUrl: safeImageUrl(input.image),
    avatarUrl: safeImageUrl(input.avatar),
    provider,
  };
}
