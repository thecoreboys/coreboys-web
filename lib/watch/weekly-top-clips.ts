import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { MEMBERS } from "@/lib/members";
import { fetchUserIdsByLogin, getAppAccessToken } from "@/lib/twitch";

/** Rolling window: "this week" is the last seven days, so Mondays aren't empty. */
export const WEEKLY_CLIP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Clip view counts move slowly enough that a 15-minute refresh is plenty. */
const REVALIDATE_SECONDS = 15 * 60;

const ClipSchema = z.object({
  id: z.string(),
  url: z.string(),
  broadcaster_id: z.string(),
  broadcaster_name: z.string(),
  creator_name: z.string().optional(),
  title: z.string(),
  view_count: z.number().int().nonnegative(),
  created_at: z.string(),
  thumbnail_url: z.string(),
  duration: z.number().nonnegative().optional(),
});
const ClipsResponseSchema = z.object({ data: z.array(ClipSchema) });

export type TwitchClip = z.infer<typeof ClipSchema>;

export type WeeklyTopClip = {
  id: string;
  memberSlug: string;
  memberLabel: string;
  portrait: string;
  accent: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  viewCount: number;
  durationSeconds?: number;
  createdAt: string;
  clippedBy?: string;
  /** In-site theater link, matching the curated clip rail. */
  href: string;
};

/**
 * Picks the single most-viewed clip created inside the window. Twitch already
 * sorts by views, but we re-check both the window and the order so a stale or
 * reordered response can't surface an old clip as "this week".
 */
export function pickTopClip(clips: readonly TwitchClip[], now: number, windowMs = WEEKLY_CLIP_WINDOW_MS): TwitchClip | null {
  const since = now - windowMs;
  let best: TwitchClip | null = null;
  for (const clip of clips) {
    const created = Date.parse(clip.created_at);
    if (!Number.isFinite(created) || created < since || created > now + 60_000) continue;
    if (!best || clip.view_count > best.view_count) best = clip;
  }
  return best;
}

/** Most-viewed first; ties go to the newer clip. */
export function rankWeeklyClips(clips: readonly WeeklyTopClip[]): WeeklyTopClip[] {
  return [...clips].sort((a, b) => b.viewCount - a.viewCount || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function theaterHref(clip: TwitchClip, slug: string) {
  const params = new URLSearchParams({
    kind: "clip",
    src: "twitch",
    id: clip.id,
    ref: `twitch-clip-${clip.id}`,
    url: clip.url,
    slug,
    title: clip.title,
    format: "long",
    orientation: "landscape",
  });
  return `/theater?${params.toString()}`;
}

async function fetchChannelClips(broadcasterId: string, startedAt: string, endedAt: string): Promise<TwitchClip[]> {
  const env = serverEnv();
  const token = await getAppAccessToken();
  const url = new URL("https://api.twitch.tv/helix/clips");
  url.searchParams.set("broadcaster_id", broadcasterId);
  url.searchParams.set("started_at", startedAt);
  url.searchParams.set("ended_at", endedAt);
  url.searchParams.set("first", "20");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, "Client-Id": env.TWITCH_CLIENT_ID },
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(4_000),
  });
  if (!res.ok) return [];
  const parsed = ClipsResponseSchema.safeParse(await res.json());
  return parsed.success ? parsed.data.data : [];
}

/**
 * The most-watched Twitch clip from each creator's channel over the past
 * week, ranked by views. Creators without a clip this week are skipped.
 * Never throws — the home page simply hides the section on failure.
 */
export async function getWeeklyTopClips(now = Date.now()): Promise<WeeklyTopClip[]> {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return [];
  try {
    // Round the window to the hour so the fetch cache key stays stable
    // between requests instead of changing every millisecond.
    const hour = 60 * 60 * 1000;
    const end = Math.ceil(now / hour) * hour;
    const startedAt = new Date(end - WEEKLY_CLIP_WINDOW_MS).toISOString();
    const endedAt = new Date(end).toISOString();
    const ids = await fetchUserIdsByLogin(MEMBERS.map((member) => member.twitchLogin));
    const picks = await Promise.all(MEMBERS.map(async (member): Promise<WeeklyTopClip | null> => {
      const broadcasterId = ids[member.twitchLogin.toLowerCase()];
      if (!broadcasterId) return null;
      const clips = await fetchChannelClips(broadcasterId, startedAt, endedAt).catch(() => []);
      const top = pickTopClip(clips, now);
      if (!top) return null;
      return {
        id: top.id,
        memberSlug: member.slug,
        memberLabel: member.stageName,
        portrait: member.portrait,
        accent: member.accent,
        title: top.title,
        url: top.url,
        thumbnailUrl: top.thumbnail_url,
        viewCount: top.view_count,
        durationSeconds: top.duration ? Math.round(top.duration) : undefined,
        createdAt: top.created_at,
        clippedBy: top.creator_name,
        href: theaterHref(top, member.slug),
      };
    }));
    return rankWeeklyClips(picks.filter((clip): clip is WeeklyTopClip => clip !== null));
  } catch {
    return [];
  }
}
