"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { MEMBERS } from "@/lib/members";
import { usePlayer } from "@/components/providers/PlayerProvider";
import type { Playable } from "@/lib/watch/playable";
import type { WatchKind, WatchPlatform } from "@/lib/watch/types";
import { formatHandleDisplay } from "@/lib/watch/display-label";

const KINDS = new Set<WatchKind>(["live", "youtube", "vod", "clip", "post", "tour"]);
const FORMATS = new Set<NonNullable<Playable["format"]>>(["long", "short", "live", "photo"]);
const ORIENTATIONS = new Set<NonNullable<Playable["orientation"]>>(["landscape", "portrait", "square"]);

function platformFor(kind: WatchKind, source: string, url: string): WatchPlatform {
  if (kind === "youtube" || source === "youtube") return "youtube";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("instagram.com")) return "instagram";
  if (source === "x" || url.includes("x.com") || url.includes("twitter.com")) return "x";
  if (kind === "live" || kind === "vod" || source === "twitch") return "twitch";
  return "house";
}

function safeImageUrl(value: string): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function TheaterStage() {
  const params = useSearchParams();
  const rawKind = params.get("kind") ?? "live";
  const kind: WatchKind = KINDS.has(rawKind as WatchKind) ? (rawKind as WatchKind) : "clip";
  const id = params.get("id") ?? "";
  const login = params.get("login") ?? "";
  const slug = params.get("slug") ?? "";
  const source = params.get("src") ?? "";
  const url = params.get("url") ?? "";
  const canonicalRef = params.get("ref") ?? "";
  const title = params.get("title") ?? "";
  const poster = safeImageUrl(params.get("poster") ?? "");
  const mediaUrl = safeImageUrl(params.get("media") ?? "");
  const rawDvrVodId = (params.get("dvr") ?? "").replace(/^v/i, "");
  const dvrVodId = /^\d+$/.test(rawDvrVodId) ? rawDvrVodId : "";
  const parsedDvrWindow = Number(params.get("dvrWindow"));
  const dvrWindowSeconds = Number.isFinite(parsedDvrWindow) && parsedDvrWindow > 0
    ? Math.min(Math.round(parsedDvrWindow), 14 * 24 * 60 * 60)
    : 0;
  const rawFormat = params.get("format") ?? "";
  const requestedFormat = FORMATS.has(rawFormat as NonNullable<Playable["format"]>)
    ? rawFormat as NonNullable<Playable["format"]>
    : null;
  const rawOrientation = params.get("orientation") ?? "";
  const requestedOrientation = ORIENTATIONS.has(rawOrientation as NonNullable<Playable["orientation"]>)
    ? rawOrientation as NonNullable<Playable["orientation"]>
    : null;
  const player = usePlayer();
  const member = MEMBERS.find(
    (entry) => entry.slug === slug || entry.twitchLogin.toLowerCase() === login.toLowerCase(),
  );

  const playable = useMemo<Playable | null>(() => {
    const reference = id || login || url;
    if (!reference) return null;
    const platform = platformFor(kind, source, url);
    const shortForm = requestedFormat === "short"
      || platform === "tiktok"
      || platform === "instagram"
      || /\/shorts\//i.test(url);
    const youtube = kind === "youtube" || source === "youtube" ? id : null;
    const key =
      canonicalRef ||
      (youtube
        ? `yt-${youtube}`
        : platform === "twitch" && kind === "live"
          ? `live-${member?.slug ?? login}`
          : kind === "vod" && id
            ? `vod-${id}`
            : id || `${kind}-${reference}`);
    return {
      key,
      kind,
      platform,
      title: title || (kind === "live" ? `${member?.stageName ?? formatHandleDisplay(login)} live` : member?.stageName ?? "CORE"),
      poster: poster ?? (youtube
        ? `https://i.ytimg.com/vi/${youtube}/maxresdefault.jpg`
        : member?.portrait ?? ""),
      memberSlug: member?.slug ?? (slug || null),
      memberLabel: member?.stageName ?? (formatHandleDisplay(login) || "CORE"),
      youtubeId: youtube,
      twitchLogin:
        kind === "live" && platform === "twitch"
          ? login || member?.twitchLogin || null
          : null,
      vodId: kind === "vod" ? id : null,
      clipSrc: kind === "clip" ? source || null : null,
      clipId: kind === "clip" ? id || null : null,
      url: url || null,
      sourceUrl: url || undefined,
      mediaUrl: mediaUrl ?? undefined,
      embeddable:
        platform === "youtube" ||
        platform === "twitch" ||
        platform === "tiktok" ||
        platform === "instagram",
      format: requestedFormat ?? (shortForm ? "short" : kind === "live" ? "live" : "long"),
      orientation: requestedOrientation ?? (shortForm ? "portrait" : undefined),
      dvr: kind === "live" && platform === "twitch" && dvrVodId
        ? {
            enabled: true,
            twitchVodId: dvrVodId,
            ...(dvrWindowSeconds > 0 ? { windowSeconds: dvrWindowSeconds } : {}),
          }
        : undefined,
    };
  }, [canonicalRef, dvrVodId, dvrWindowSeconds, id, kind, login, mediaUrl, member, poster, requestedFormat, requestedOrientation, slug, source, title, url]);

  useEffect(() => {
    if (!playable || !player.ready) return;
    // During an in-Theater short-form step, the provider changes first and
    // PersistentPlayer replaces the query immediately after render. Do not
    // let the previous query race that channel-owned current item backward.
    if (player.mode === "theater" && player.current && player.shortFormNavigation) {
      player.expand();
      return;
    }
    if (player.current?.key === playable.key) {
      player.expand();
      return;
    }
    player.play(playable, undefined, { mode: "theater" });
    // The stable query-derived key intentionally controls this handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playable?.key, player.ready]);

  if (!playable) {
    return (
      <section className="grid min-h-[55vh] place-items-center px-5 text-center">
        <div>
          <p className="watch-kicker">Theater</p>
          <h1 className="watch-title mt-3 text-4xl">Choose a title from Watch or Guide</h1>
          <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[color:var(--core)] px-5 text-sm font-semibold text-white">
            Browse Watch
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-dvh bg-[#050507]" aria-label={`Loading ${playable.title}`}>
      <p className="sr-only">Opening {playable.title} in the CORE media player.</p>
    </section>
  );
}
