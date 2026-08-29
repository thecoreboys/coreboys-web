import type {
  WatchCatalog,
  WatchChapter,
  WatchItem,
  WatchQualitySource,
  WatchTextTrack,
} from "./types";

export type Playable = {
  key: string;
  kind: WatchItem["kind"];
  platform: WatchItem["platform"];
  title: string;
  poster: string;
  memberSlug: string | null;
  memberLabel: string;
  accountLabel?: string;
  youtubeId: string | null;
  twitchLogin: string | null;
  vodId: string | null;
  clipSrc: string | null;
  clipId: string | null;
  url: string | null;
  sourceUrl?: string;
  mediaUrl?: string;
  embedUrl?: string;
  embeddable?: boolean;
  orientation?: WatchItem["orientation"];
  previewStrategy?: WatchItem["previewStrategy"];
  focalPoint?: WatchItem["focalPoint"];
  durationSeconds?: number;
  chapters?: WatchChapter[];
  relatedFullVideoId?: string;
  captions?: WatchTextTrack[];
  qualities?: WatchQualitySource[];
  audioDescriptionUrl?: string;
  dvr?: {
    enabled: true;
    windowSeconds?: number;
    twitchVodId?: string;
  };
  publishedAt?: string;
  format?: WatchItem["format"];
  /** Short, user-facing explanation supplied by the recommendation service. */
  recommendationReason?: string;
};

export function contentShape(item: {
  format?: WatchItem["format"];
  orientation?: WatchItem["orientation"];
  platform?: string;
  href?: string;
  sourceUrl?: string;
  kind?: string;
}): "landscape" | "portrait" | "square" {
  const source = `${item.sourceUrl ?? ""}\n${item.href ?? ""}`;
  if (
    item.format === "short" ||
    item.platform === "tiktok" ||
    (item.platform === "youtube" && /\/shorts\//i.test(source)) ||
    (item.platform === "instagram" && /\/reels?\//i.test(source))
  ) {
    return "portrait";
  }
  if (item.orientation) return item.orientation;
  if (item.format === "photo") return "square";
  return "landscape";
}

export function tiktokIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const m =
    /tiktok\.com\/[^/]+\/video\/(\d+)/i.exec(url) ||
    /\/player\/v1\/(\d+)/.exec(url) ||
    /\/embed\/v2\/(\d+)/.exec(url) ||
    /\/video\/(\d+)/.exec(url);
  return m?.[1] ?? null;
}

/** Return Instagram's official post embed URL for a canonical permalink. */
export function instagramEmbedUrl(permalink?: string | null): string | null {
  const match = /instagram\.com\/(?:[^/?#]+\/)?(reel|reels|p|tv)\/([^/?#]+)/i.exec(permalink ?? "");
  if (!match?.[2]) return null;
  const shortcode = match[2];
  const route = match?.[1]?.toLowerCase() === "p"
    ? "p"
    : match?.[1]?.toLowerCase() === "tv"
      ? "tv"
      : "reel";
  return `https://www.instagram.com/${route}/${encodeURIComponent(shortcode)}/embed`;
}

function instagramEmbed(item: Playable): string | null {
  if (item.platform !== "instagram") return null;
  const candidate = item.sourceUrl ?? item.url ?? "";
  return instagramEmbedUrl(candidate) ?? (
    item.clipSrc === "instagram" && item.clipId
      ? `https://www.instagram.com/reel/${encodeURIComponent(item.clipId)}/embed`
      : null
  );
}

function trustedFrameUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    const trusted =
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com") ||
      host === "twitch.tv" ||
      host.endsWith(".twitch.tv") ||
      host === "tiktok.com" ||
      host.endsWith(".tiktok.com") ||
      host === "instagram.com" ||
      host.endsWith(".instagram.com");
    return trusted ? url.toString() : null;
  } catch {
    return null;
  }
}

export function youtubeIdFromHref(href: string): string | null {
  try {
    const url = new URL(href, "https://core.local");
    const host = url.hostname.toLowerCase();
    const directYoutube =
      host === "youtu.be" ||
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com");

    if (directYoutube) {
      const pathId =
        host === "youtu.be"
          ? url.pathname.split("/").filter(Boolean)[0]
          : /\/(?:shorts|embed)\/([0-9A-Za-z_-]{6,})/i.exec(url.pathname)?.[1];
      const id = pathId ?? url.searchParams.get("v");
      return id && /^[0-9A-Za-z_-]{6,}$/.test(id) ? id : null;
    }

    const kind = url.searchParams.get("kind");
    const source = url.searchParams.get("src");
    if (kind !== "youtube" && source !== "youtube") return null;
    const id = url.searchParams.get("id");
    return id && /^[0-9A-Za-z_-]{6,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Turn a supported public media URL into a safe, shareable player source. */
export function playableFromUrl(raw: string): Playable | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const youtubeId = youtubeIdFromHref(parsed.toString());
    if (youtubeId) {
      return {
        key: `yt-${youtubeId}`,
        kind: "youtube",
        platform: "youtube",
        title: "YouTube video",
        poster: `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`,
        memberSlug: null,
        memberLabel: "YouTube",
        youtubeId,
        twitchLogin: null,
        vodId: null,
        clipSrc: null,
        clipId: null,
        url: parsed.toString(),
        sourceUrl: parsed.toString(),
        embeddable: true,
        format: parsed.pathname.includes("/shorts/") ? "short" : "long",
      };
    }
    if (host === "twitch.tv" || host.endsWith(".twitch.tv")) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (host === "clips.twitch.tv" && parts[0]) {
        return {
          key: `clip-twitch-${parts[0]}`,
          kind: "clip",
          platform: "twitch",
          title: "Twitch clip",
          poster: "",
          memberSlug: null,
          memberLabel: "Twitch",
          youtubeId: null,
          twitchLogin: null,
          vodId: null,
          clipSrc: "twitch",
          clipId: parts[0],
          url: parsed.toString(),
          sourceUrl: parsed.toString(),
          embeddable: true,
          format: "short",
        };
      }
      if (parts[0] === "videos" && parts[1]) {
        return {
          key: `vod-${parts[1]}`,
          kind: "vod",
          platform: "twitch",
          title: "Twitch VOD",
          poster: "",
          memberSlug: null,
          memberLabel: "Twitch",
          youtubeId: null,
          twitchLogin: null,
          vodId: parts[1],
          clipSrc: null,
          clipId: null,
          url: parsed.toString(),
          sourceUrl: parsed.toString(),
          embeddable: true,
          format: "long",
        };
      }
      const login = parts[0]?.toLowerCase();
      if (login && /^[a-z0-9_]{2,40}$/.test(login)) {
        return {
          key: `live-${login}`,
          kind: "live",
          platform: "twitch",
          title: `${login} live`,
          poster: "",
          memberSlug: null,
          memberLabel: login,
          youtubeId: null,
          twitchLogin: login,
          vodId: null,
          clipSrc: null,
          clipId: null,
          url: parsed.toString(),
          sourceUrl: parsed.toString(),
          embeddable: true,
          format: "live",
        };
      }
    }
    const tiktok = tiktokIdFromUrl(parsed.toString());
    if (tiktok) {
      return {
        key: `tiktok-${tiktok}`,
        kind: "clip",
        platform: "tiktok",
        title: "TikTok video",
        poster: "",
        memberSlug: null,
        memberLabel: "TikTok",
        youtubeId: null,
        twitchLogin: null,
        vodId: null,
        clipSrc: "tiktok",
        clipId: tiktok,
        url: parsed.toString(),
        sourceUrl: parsed.toString(),
        embeddable: true,
        format: "short",
        orientation: "portrait",
      };
    }
    if (host === "instagram.com" || host.endsWith(".instagram.com")) {
      const match = /\/(?:reel|reels|p|tv)\/([^/?#]+)/i.exec(parsed.pathname);
      if (match?.[1]) {
        return {
          key: `instagram-${match[1]}`,
          kind: "clip",
          platform: "instagram",
          title: "Instagram video",
          poster: "",
          memberSlug: null,
          memberLabel: "Instagram",
          youtubeId: null,
          twitchLogin: null,
          vodId: null,
          clipSrc: "instagram",
          clipId: match[1],
          url: parsed.toString(),
          sourceUrl: parsed.toString(),
          embeddable: true,
          format: "short",
          orientation: "portrait",
        };
      }
    }
    if (/\.(?:mp4|webm|m3u8)(?:$|\?)/i.test(parsed.pathname + parsed.search)) {
      return {
        key: `media-${encodeURIComponent(parsed.toString()).slice(-180)}`,
        kind: "youtube",
        platform: "house",
        title: parsed.pathname.split("/").pop()?.replace(/[-_]/g, " ") || "CORE video",
        poster: "",
        memberSlug: null,
        memberLabel: "CORE",
        youtubeId: null,
        twitchLogin: null,
        vodId: null,
        clipSrc: null,
        clipId: null,
        url: parsed.toString(),
        sourceUrl: parsed.toString(),
        mediaUrl: parsed.toString(),
        embeddable: true,
        format: "long",
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function itemToPlayable(item: WatchItem): Playable | null {
  // Social text posts are external documents, not media. Keeping this guard at
  // the conversion boundary prevents generic cards/search from opening an
  // empty player for an X post while still allowing attached X video items.
  if (item.kind === "post") return null;
  let search: URLSearchParams;
  try {
    search = new URL(item.href, "https://core.local").searchParams;
  } catch {
    search = new URLSearchParams();
  }
  const kind = (search.get("kind") as WatchItem["kind"] | null) ?? item.kind;
  const liveLogin = /\/watch\/live\/([^/?#]+)/.exec(item.href)?.[1] ?? search.get("login");
  // Catalog entries normally carry a canonical YouTube href, but imported
  // programming can instead expose the official player URL in `embedUrl` or
  // the source permalink in `sourceUrl`. Resolve all trusted references here
  // so every surface (hero, channel, Theater, and multiview) gets the same
  // muted autoplay-capable YouTube embed rather than falling back to an
  // opaque provider iframe that cannot be controlled by CORE.
  const yt = [item.sourceUrl, item.embedUrl, item.mediaUrl, item.href]
    .map((candidate) => youtubeIdFromHref(candidate ?? ""))
    .find((candidate): candidate is string => Boolean(candidate)) ?? null;
  const id = search.get("id");
  if (item.kind === "tour" && item.format !== "photo" && !yt && !id) return null;
  const photoMedia = item.format === "photo"
    ? item.mediaUrl ?? item.poster ?? item.backdrop
    : item.mediaUrl;

  return {
    key: item.id,
    kind,
    platform: item.platform,
    title: item.title,
    poster: item.poster || item.backdrop,
    memberSlug: item.memberSlug,
    memberLabel: item.memberLabel,
    accountLabel: item.accountLabel,
    youtubeId: yt,
    twitchLogin: liveLogin ? decodeURIComponent(liveLogin) : item.live?.login ?? null,
    vodId: kind === "vod" ? id : null,
    clipSrc: search.get("src"),
    clipId: kind === "clip" ? id : null,
    url: search.get("url") ?? item.mediaUrl ?? item.embedUrl ?? item.sourceUrl ?? null,
    sourceUrl: item.sourceUrl,
    mediaUrl: photoMedia,
    embedUrl: item.embedUrl,
    embeddable: item.embeddable,
    orientation: item.orientation,
    previewStrategy: item.previewStrategy,
    focalPoint: item.focalPoint,
    durationSeconds: item.durationSeconds,
    chapters: item.chapters,
    relatedFullVideoId: item.relatedFullVideoId,
    captions: item.captions,
    qualities: item.qualities,
    audioDescriptionUrl: item.audioDescriptionUrl,
    dvr: item.dvr,
    publishedAt: item.publishedAt,
    format: item.format,
  };
}

export function catalogPlayables(catalog: WatchCatalog): Playable[] {
  const out: Playable[] = [];
  const seen = new Set<string>();
  for (const item of catalog.all) {
    const p = itemToPlayable(item);
    const externalOnly =
      item.embeddable === false &&
      !p?.mediaUrl &&
      !p?.embedUrl;
    if (!p || externalOnly || seen.has(p.key)) continue;
    seen.add(p.key);
    out.push(p);
  }
  return out;
}

export function embedFor(
  item: Playable,
  opts: {
    parent: string | null;
    origin: string | null;
    muted?: boolean;
    /** Defaults to true. Preloaded players opt out until promoted on screen. */
    autoplay?: boolean;
    /** Preview surfaces loop; full media-player autoplay must not. */
    loop?: boolean;
    controls?: boolean;
    captions?: boolean;
    startSeconds?: number;
  },
): string | null {
  const { parent, origin } = opts;
  const muted = Boolean(opts.muted);
  const autoplay = opts.autoplay !== false;
  const loop = opts.loop ?? muted;
  const controls = opts.controls !== false;
  if (item.youtubeId) {
    const qs = new URLSearchParams({
      autoplay: autoplay ? "1" : "0",
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
      enablejsapi: "1",
      mute: muted ? "1" : "0",
      controls: controls ? "1" : "0",
      disablekb: controls ? "0" : "1",
      fs: controls ? "1" : "0",
      iv_load_policy: "3",
    });
    if (opts.startSeconds && opts.startSeconds > 0) {
      qs.set("start", String(Math.floor(opts.startSeconds)));
    }
    if (opts.captions) {
      qs.set("cc_load_policy", "1");
      qs.set("cc_lang_pref", "en");
    }
    if (loop) {
      qs.set("loop", "1");
      qs.set("playlist", item.youtubeId);
    }
    if (origin) {
      qs.set("origin", origin);
      qs.set("widget_referrer", origin);
    }
    return `https://www.youtube-nocookie.com/embed/${item.youtubeId}?${qs}`;
  }
  if (item.kind === "live" && item.twitchLogin && parent) {
    return `https://player.twitch.tv/?channel=${encodeURIComponent(item.twitchLogin)}&parent=${parent}&autoplay=${autoplay ? "true" : "false"}&muted=${muted ? "true" : "false"}`;
  }
  if (item.vodId && parent) {
    const qs = new URLSearchParams({
      video: item.vodId,
      parent,
      autoplay: autoplay ? "true" : "false",
      muted: muted ? "true" : "false",
    });
    if (opts.startSeconds && opts.startSeconds > 0) {
      const totalSeconds = Math.floor(opts.startSeconds);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      qs.set("time", `${hours}h${minutes}m${seconds}s`);
    }
    return `https://player.twitch.tv/?${qs}`;
  }
  if (item.kind === "clip" && item.clipSrc === "twitch" && item.clipId && parent) {
    return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(item.clipId)}&parent=${parent}&autoplay=${autoplay ? "true" : "false"}&muted=${muted ? "true" : "false"}`;
  }
  const tiktok = tiktokIdFromUrl(item.sourceUrl ?? item.url);
  if (tiktok) {
    const qs = new URLSearchParams({
      autoplay: autoplay ? "1" : "0",
      muted: muted ? "1" : "0",
      loop: loop ? "1" : "0",
      controls: controls ? "1" : "0",
      progress_bar: controls ? "1" : "0",
      play_button: "0",
      volume_control: controls ? "1" : "0",
      fullscreen_button: controls ? "1" : "0",
      timestamp: "0",
      music_info: "0",
      description: "0",
    });
    return `https://www.tiktok.com/player/v1/${tiktok}?${qs}`;
  }
  const instagram = instagramEmbed(item);
  if (instagram) return instagram;
  const normalizedEmbed = trustedFrameUrl(item.embedUrl);
  if (normalizedEmbed) return normalizedEmbed;
  if (item.embeddable !== false) return trustedFrameUrl(item.url);
  return null;
}
