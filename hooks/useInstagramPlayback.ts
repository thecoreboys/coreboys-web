"use client";

import { useEffect, useState } from "react";
import { instagramPlaybackShortcode, type InstagramPlayback } from "@/lib/watch/instagram-playback";

const cache = new Map<string, { media: InstagramPlayback | null; expiresAt: number }>();
const pending = new Map<string, Promise<InstagramPlayback | null>>();

function lookup(shortcode: string): Promise<InstagramPlayback | null> {
  const known = cache.get(shortcode);
  if (known && known.expiresAt > Date.now()) return Promise.resolve(known.media);
  const inFlight = pending.get(shortcode);
  if (inFlight) return inFlight;
  const request = fetch(`/api/watch/instagram-playback?shortcode=${encodeURIComponent(shortcode)}`, { signal: AbortSignal.timeout(4_000) })
    .then(async (response) => {
      const body = response.ok ? await response.json() : null;
      const candidate = body?.media;
      const media: InstagramPlayback | null = candidate && typeof candidate.url === "string" && typeof candidate.expiresAt === "number" && candidate.expiresAt > Date.now()
        ? candidate : null;
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(shortcode, { media, expiresAt: Math.min(media?.expiresAt ?? Infinity, Date.now() + (media ? 120_000 : 30_000)) });
      return media;
    }).catch(() => null).finally(() => pending.delete(shortcode));
  pending.set(shortcode, request);
  return request;
}

/** Only an active preview/player may resolve a Reel; identical surfaces share one lookup. */
export function useInstagramPlayback(source: string | null | undefined, enabled: boolean): string | null {
  const shortcode = instagramPlaybackShortcode(source);
  const [resolved, setResolved] = useState<{ shortcode: string; media: InstagramPlayback } | null>(null);
  useEffect(() => {
    if (!enabled || !shortcode) return;
    let disposed = false;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    void lookup(shortcode).then((media) => {
      if (disposed || !media) return;
      setResolved({ shortcode, media });
      expiryTimer = setTimeout(() => { setResolved(null); }, Math.max(0, media.expiresAt - Date.now()));
    });
    return () => { disposed = true; clearTimeout(expiryTimer); };
  }, [enabled, shortcode]);
  return resolved?.shortcode === shortcode && resolved.media.expiresAt > Date.now() ? resolved.media.url : null;
}
