"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TwitchChatBadgeDetail } from "@/lib/twitch";

type BadgeIndex = Record<string, TwitchChatBadgeDetail>;
type BadgeBundle = { global: BadgeIndex; channels: Record<string, BadgeIndex> };

export type TwitchBadgeChannel = {
  login: string;
  userId?: string;
};

const FALLBACK_URLS: Record<string, string> = {
  moderator: "https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/1",
  broadcaster: "https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/1",
  vip: "https://static-cdn.jtvnw.net/badges/v1/b817aba4-fad8-49e2-b88a-7cc744dfa6ec/1",
  subscriber: "https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/1",
  founder: "https://static-cdn.jtvnw.net/badges/v1/511b78a9-ab37-472f-9569-457753bbe7d3/1",
  premium: "https://static-cdn.jtvnw.net/badges/v1/a1dd5073-19c3-4911-8cb4-c464a7bc1510/1",
  bits: "https://static-cdn.jtvnw.net/badges/v1/73b5c3fb-24f9-4a82-a852-2f475b59411c/1",
  "no_audio": "https://static-cdn.jtvnw.net/badges/v1/aef2cd08-f29b-45a1-8c12-d44d7fd5e6f0/1",
  "no_video": "https://static-cdn.jtvnw.net/badges/v1/199a0dba-58f3-494e-a7fc-1fa0a1001fb8/1",
  partner: "https://static-cdn.jtvnw.net/badges/v1/d12a2e27-16f6-41d0-ab77-b780518f00a3/1",
  staff: "https://static-cdn.jtvnw.net/badges/v1/d97c37bd-a6f5-4c38-8f57-4e4bef88af34/1",
  admin: "https://static-cdn.jtvnw.net/badges/v1/9ef7e029-4ccd-4fee-a8d6-5800e5095453/1",
  artist: "https://static-cdn.jtvnw.net/badges/v1/4300a897-03dc-4e83-8c0e-c332fee7057f/1",
  "artist-badge": "https://static-cdn.jtvnw.net/badges/v1/4300a897-03dc-4e83-8c0e-c332fee7057f/1",
};

const FALLBACK: BadgeIndex = Object.fromEntries(
  Object.entries(FALLBACK_URLS).map(([setId, url]) => {
    const title = setId.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    return [setId, { url, title, description: `${title} Twitch badge` }];
  }),
);

const cache = new Map<string, BadgeBundle>();
const inflight = new Map<string, Promise<BadgeBundle>>();

async function loadBadges(channelKey: string): Promise<BadgeBundle> {
  const key = channelKey || "global";
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;
  const query = channelKey ? `?channelIds=${encodeURIComponent(channelKey.replaceAll("|", ","))}` : "";
  const job = fetch(`/api/twitch/badges${query}`, { credentials: "same-origin" })
    .then((response) => (response.ok ? response.json() : { global: {}, channels: {} }))
    .then((bundle: BadgeBundle) => {
      const normalized = {
        global: bundle.global ?? {},
        channels: bundle.channels ?? {},
      };
      cache.set(key, normalized);
      inflight.delete(key);
      return normalized;
    })
    .catch(() => {
      inflight.delete(key);
      return { global: {}, channels: {} };
    });
  inflight.set(key, job);
  return job;
}

export function useTwitchBadges(channelId?: string) {
  const { detailFor: detailForChannel } = useTwitchBadgesByChannel([
    { login: "channel", userId: channelId },
  ]);

  function urlFor(setId: string, version: string): string | null {
    return detailForChannel("channel", setId, version)?.url ?? null;
  }

  function detailFor(setId: string, version: string): TwitchChatBadgeDetail | null {
    return detailForChannel("channel", setId, version);
  }

  return { urlFor, detailFor };
}

/**
 * Resolves Twitch badges against the channel where each message was sent.
 * Subscriber, founder, and bits badge art is channel-specific, so a merged
 * chat must not reuse one broadcaster's badge map for every message.
 */
export function useTwitchBadgesByChannel(channels: TwitchBadgeChannel[]) {
  const [globalMap, setGlobal] = useState<BadgeIndex>({});
  const [channelMaps, setChannelMaps] = useState<Record<string, BadgeIndex>>({});
  const channelKey = [...new Set(
    channels
      .map((channel) => channel.userId?.trim())
      .filter((channelId): channelId is string => Boolean(channelId)),
  )]
    .sort()
    .join("|");
  const channelLookupKey = channels
    .map((channel) => `${channel.login.trim().toLowerCase()}:${channel.userId?.trim() ?? ""}`)
    .sort()
    .join("|");
  const channelIdsByLogin = useMemo(
    () => new Map(channels.map((channel) => [channel.login.trim().toLowerCase(), channel.userId?.trim()])),
    // `channelLookupKey` represents the only fields the lookup needs. Keeping
    // the map stable lets memoized chat rows avoid rerendering for each line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelLookupKey],
  );

  useEffect(() => {
    let cancelled = false;
    void loadBadges(channelKey).then((bundle) => {
      if (cancelled) return;
      setGlobal(bundle.global);
      setChannelMaps(bundle.channels);
    });

    return () => {
      cancelled = true;
    };
  }, [channelKey]);

  const detailFor = useCallback((
    channelLogin: string,
    setId: string,
    version: string,
  ): TwitchChatBadgeDetail | null => {
    const normalizedLogin = channelLogin.trim().toLowerCase();
    const channelId = channelIdsByLogin.get(normalizedLogin);
    const channelMap = channelId ? channelMaps[channelId] : undefined;
    const normalizedSetId = setId.toLowerCase();
    return (
      channelMap?.[`${normalizedSetId}/${version}`] ||
      globalMap[`${normalizedSetId}/${version}`] ||
      channelMap?.[normalizedSetId] ||
      globalMap[normalizedSetId] ||
      FALLBACK[normalizedSetId] ||
      null
    );
  }, [channelIdsByLogin, channelMaps, globalMap]);

  const urlFor = useCallback(
    (channelLogin: string, setId: string, version: string): string | null => detailFor(channelLogin, setId, version)?.url ?? null,
    [detailFor],
  );

  return useMemo(() => ({ urlFor, detailFor }), [detailFor, urlFor]);
}
