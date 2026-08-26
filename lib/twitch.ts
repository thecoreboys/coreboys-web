import { z } from "zod";
import { serverEnv } from "./env";

const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().int().positive(),
  token_type: z.string(),
});

const UserSchema = z.object({
  id: z.string(),
  login: z.string(),
  display_name: z.string(),
  profile_image_url: z.string().url().optional(),
});

const UsersResponseSchema = z.object({
  data: z.array(UserSchema),
});

const FollowResponseSchema = z.object({
  total: z.number().int().nonnegative(),
});

const ChatBadgeResponseSchema = z.object({
  data: z.array(z.object({
    set_id: z.string(),
    versions: z.array(z.object({
      id: z.string(),
      image_url_1x: z.string().url().optional(),
      image_url_2x: z.string().url().optional(),
      image_url_4x: z.string().url().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      click_action: z.string().nullable().optional(),
      click_url: z.string().nullable().optional(),
    })),
  })),
});

const StreamSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  user_login: z.string(),
  user_name: z.string(),
  game_id: z.string().optional(),
  game_name: z.string().optional(),
  type: z.string(),
  title: z.string(),
  viewer_count: z.number().int().nonnegative(),
  started_at: z.string(),
  language: z.string().optional(),
  thumbnail_url: z.string(),
  tag_ids: z.array(z.string()).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  is_mature: z.boolean().optional(),
});

const StreamsResponseSchema = z.object({
  data: z.array(StreamSchema),
  pagination: z.object({ cursor: z.string().optional() }).optional(),
});

export type TwitchStream = z.infer<typeof StreamSchema>;

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAppAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.value;
  }
  const env = serverEnv();
  const params = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`twitch token fetch failed (${res.status}): ${body}`);
  }
  const json = TokenResponseSchema.parse(await res.json());
  cachedToken = {
    value: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cachedToken.value;
}

function buildThumbnailUrl(template: string, width = 640, height = 360): string {
  return template.replace("{width}", String(width)).replace("{height}", String(height));
}

export async function fetchLiveStreams(logins: readonly string[]): Promise<TwitchStream[]> {
  if (logins.length === 0) return [];
  const env = serverEnv();
  const token = await getAppAccessToken();
  const url = new URL("https://api.twitch.tv/helix/streams");
  for (const login of logins) {
    url.searchParams.append("user_login", login);
  }
  url.searchParams.append("first", "100");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": env.TWITCH_CLIENT_ID,
    },
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`twitch streams fetch failed (${res.status}): ${body}`);
  }
  const parsed = StreamsResponseSchema.parse(await res.json());
  return parsed.data;
}

export type LiveEntry = {
  login: string;
  isLive: boolean;
  /** Twitch's immutable stream id for this exact live session. */
  streamId?: string;
  title?: string;
  viewerCount?: number;
  thumbnailUrl?: string;
  game?: string;
  startedAt?: string;
};

export type LiveResponse = {
  live: LiveEntry[];
  fetchedAt: string;
};

/**
 * Resolves Twitch logins → numeric user IDs. Required for the BTTV / 7TV
 * emote APIs, which key off Twitch user IDs and not logins. Cached for an
 * hour because user IDs are effectively immutable.
 */
export async function fetchUserIdsByLogin(
  logins: readonly string[],
): Promise<Record<string, string>> {
  if (logins.length === 0) return {};
  const env = serverEnv();
  const token = await getAppAccessToken();
  const url = new URL("https://api.twitch.tv/helix/users");
  for (const login of logins) {
    url.searchParams.append("login", login);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": env.TWITCH_CLIENT_ID,
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`twitch users fetch failed (${res.status}): ${body}`);
  }
  const parsed = UsersResponseSchema.parse(await res.json());
  return Object.fromEntries(parsed.data.map((u) => [u.login.toLowerCase(), u.id]));
}

// ---------------------------------------------------------------------------
// VOD archive — past broadcasts via Helix /videos (app token, no user OAuth).
// ---------------------------------------------------------------------------

const VideoSchema = z.object({
  id: z.string(),
  stream_id: z.string().optional().default(""),
  title: z.string(),
  url: z.string(),
  thumbnail_url: z.string(),
  duration: z.string(),
  created_at: z.string(),
  view_count: z.number(),
});
const VideosResponseSchema = z.object({ data: z.array(VideoSchema) });

export type TwitchVod = {
  id: string;
  /** The originating live stream id; empty for uploads/highlights. */
  streamId: string;
  title: string;
  url: string;
  /** Sized thumbnail URL (template placeholders already substituted). */
  thumbnailUrl: string;
  /** Raw Twitch duration, e.g. "3h21m4s". */
  duration: string;
  createdAt: string;
  viewCount: number;
};

/**
 * Latest past broadcasts (VODs) for a channel. Uses the app access token —
 * `type=archive` past broadcasts are public, no user OAuth needed. Twitch
 * only retains VODs for ~14–60 days depending on the channel tier, so an
 * empty result is normal. Never throws — returns [] on any failure so a
 * member page can't break on a bad Twitch response.
 */
export async function fetchChannelVideos(
  userId: string,
  limit = 12,
  revalidateSeconds = 1800,
): Promise<TwitchVod[]> {
  if (!userId) return [];
  try {
    const env = serverEnv();
    const token = await getAppAccessToken();
    const url = new URL("https://api.twitch.tv/helix/videos");
    url.searchParams.set("user_id", userId);
    url.searchParams.set("type", "archive");
    url.searchParams.set("sort", "time");
    url.searchParams.set("first", String(Math.min(Math.max(limit, 1), 100)));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": env.TWITCH_CLIENT_ID,
      },
      next: { revalidate: revalidateSeconds },
    });
    if (!res.ok) return [];
    const parsed = VideosResponseSchema.safeParse(await res.json());
    if (!parsed.success) return [];
    return parsed.data.data.map((v) => ({
      id: v.id,
      streamId: v.stream_id,
      title: v.title,
      url: v.url,
      thumbnailUrl: v.thumbnail_url
        .replace("%{width}", "640")
        .replace("%{height}", "360"),
      duration: v.duration,
      createdAt: v.created_at,
      viewCount: v.view_count,
    }));
  } catch {
    return [];
  }
}

/**
 * Resolves Twitch logins → full user records (id, display name, profile image).
 * Used by the roster + nav avatar paths so we render the canonical Twitch
 * profile picture rather than a static asset. Cached at the edge for an hour.
 */
export type TwitchUser = z.infer<typeof UserSchema>;

export type TwitchChatBadgeDetail = {
  url: string;
  title: string;
  description: string;
  clickUrl?: string | null;
};

export type TwitchChatBadgeIndex = Record<string, TwitchChatBadgeDetail>;

/**
 * Loads Twitch's global badge catalog or one broadcaster's custom catalog.
 * The app token stays server-side; clients receive only the public CDN URLs.
 */
export async function fetchTwitchChatBadges(
  broadcasterId?: string,
): Promise<TwitchChatBadgeIndex> {
  try {
    const env = serverEnv();
    const token = await getAppAccessToken();
    const url = new URL(
      broadcasterId
        ? "https://api.twitch.tv/helix/chat/badges"
        : "https://api.twitch.tv/helix/chat/badges/global",
    );
    if (broadcasterId) url.searchParams.set("broadcaster_id", broadcasterId);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": env.TWITCH_CLIENT_ID,
      },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return {};

    const parsed = ChatBadgeResponseSchema.safeParse(await response.json());
    if (!parsed.success) return {};

    const badges: TwitchChatBadgeIndex = {};
    for (const set of parsed.data.data) {
      for (const version of set.versions) {
        const image = version.image_url_2x || version.image_url_1x || version.image_url_4x;
        if (!image) continue;
        const setId = set.set_id.toLowerCase();
        const fallbackTitle = setId.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
        const detail: TwitchChatBadgeDetail = {
          url: image,
          title: version.title?.trim() || fallbackTitle,
          description: version.description?.trim() || `${fallbackTitle} Twitch badge`,
          clickUrl: version.click_url || null,
        };
        badges[`${setId}/${version.id}`] = detail;
        if (!badges[setId]) badges[setId] = detail;
      }
    }
    return badges;
  } catch {
    return {};
  }
}

export async function fetchUsersByLogin(
  logins: readonly string[],
): Promise<Record<string, TwitchUser>> {
  if (logins.length === 0) return {};
  const env = serverEnv();
  const token = await getAppAccessToken();
  const url = new URL("https://api.twitch.tv/helix/users");
  for (const login of logins) {
    url.searchParams.append("login", login);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": env.TWITCH_CLIENT_ID,
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`twitch users fetch failed (${res.status}): ${body}`);
  }
  const parsed = UsersResponseSchema.parse(await res.json());
  return Object.fromEntries(parsed.data.map((u) => [u.login.toLowerCase(), u]));
}

/**
 * Returns the real-time follower count for a Twitch user_id. Twitch's
 * Helix follower endpoint accepts an app token but only returns the
 * `total` field (no list) without broadcaster auth — that's exactly
 * what we need.
 *
 * Cached for 10 minutes so we don't hammer Helix on every page view.
 */
export async function fetchFollowerCount(userId: string): Promise<number | null> {
  const env = serverEnv();
  const token = await getAppAccessToken();
  const url = new URL("https://api.twitch.tv/helix/channels/followers");
  url.searchParams.set("broadcaster_id", userId);
  url.searchParams.set("first", "1");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": env.TWITCH_CLIENT_ID,
    },
    next: { revalidate: 600 },
  });
  if (!res.ok) return null;
  try {
    const parsed = FollowResponseSchema.parse(await res.json());
    return parsed.total;
  } catch {
    return null;
  }
}

export type MemberLiveSnapshot = {
  login: string;
  streamId?: string;
  userId: string;
  displayName: string;
  profileImageUrl?: string;
  followers: number | null;
  isLive: boolean;
  viewerCount?: number;
  game?: string;
  title?: string;
  startedAt?: string;
};

/**
 * High-level helper: returns a single payload with everything needed
 * to render a "real-time analytics" panel for a list of members —
 * follower counts, current live status + viewers, profile pics.
 */
export async function fetchMemberSnapshots(
  logins: readonly string[],
): Promise<MemberLiveSnapshot[]> {
  const [users, streams] = await Promise.all([
    fetchUsersByLogin(logins),
    fetchLiveStreams(logins),
  ]);
  const liveByLogin = new Map(streams.map((s) => [s.user_login.toLowerCase(), s]));

  const out: MemberLiveSnapshot[] = await Promise.all(
    logins.map(async (login) => {
      const u = users[login.toLowerCase()];
      if (!u) {
        return {
          login,
          userId: "",
          displayName: login,
          followers: null,
          isLive: false,
        };
      }
      const followers = await fetchFollowerCount(u.id);
      const live = liveByLogin.get(login.toLowerCase());
      return {
        login,
        streamId: live?.id,
        userId: u.id,
        displayName: u.display_name,
        profileImageUrl: u.profile_image_url,
        followers,
        isLive: !!live,
        viewerCount: live?.viewer_count,
        game: live?.game_name,
        title: live?.title,
        startedAt: live?.started_at,
      };
    }),
  );
  return out;
}

export async function buildLiveResponse(logins: readonly string[]): Promise<LiveResponse> {
  const streams = await fetchLiveStreams(logins);
  const byLogin = new Map(streams.map((s) => [s.user_login.toLowerCase(), s]));
  const entries: LiveEntry[] = logins.map((login) => {
    const stream = byLogin.get(login.toLowerCase());
    if (!stream) return { login, isLive: false };
    return {
      login,
      isLive: true,
      streamId: stream.id,
      title: stream.title,
      viewerCount: stream.viewer_count,
      thumbnailUrl: buildThumbnailUrl(stream.thumbnail_url),
      game: stream.game_name,
      startedAt: stream.started_at,
    };
  });
  return { live: entries, fetchedAt: new Date().toISOString() };
}
