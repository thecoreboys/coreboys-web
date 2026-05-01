import { z } from "zod";
import { serverEnv } from "./env";

const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().int().positive(),
  token_type: z.string(),
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
