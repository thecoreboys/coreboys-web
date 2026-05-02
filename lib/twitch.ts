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
  tag_ids: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  is_mature: z.boolean().optional(),
});

const StreamsResponseSchema = z.object({
  data: z.array(StreamSchema),
  pagination: z.object({ cursor: z.string().optional() }).optional(),
});

export type TwitchStream = z.infer<typeof StreamSchema>;

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAppAccessToken(): Promise<string> {
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

/**
 * Resolves Twitch logins → full user records (id, display name, profile image).
 * Used by the roster + nav avatar paths so we render the canonical Twitch
 * profile picture rather than a static asset. Cached at the edge for an hour.
 */
export type TwitchUser = z.infer<typeof UserSchema>;

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
      title: stream.title,
      viewerCount: stream.viewer_count,
      thumbnailUrl: buildThumbnailUrl(stream.thumbnail_url),
      game: stream.game_name,
      startedAt: stream.started_at,
    };
  });
  return { live: entries, fetchedAt: new Date().toISOString() };
}
