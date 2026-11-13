import { unstable_cache } from "next/cache";
import { query } from "@/lib/db";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import { socialFetchRequestKey } from "@/lib/social-fetch-request-cache";
import { cachedInstagramPlayback, type InstagramPlayback } from "./instagram-playback";

const readSnapshot = unstable_cache(async (keys: string[]) => {
  const rows = await query<{ payload: unknown; expires_at: Date }>(
    `SELECT payload, expires_at FROM social_fetch_request_cache
       WHERE request_key = ANY($1::text[]) AND expires_at > now() AND payload IS NOT NULL`, [keys],
  );
  const media = new Map<string, InstagramPlayback>();
  for (const row of rows.rows) {
    for (const [shortcode, source] of cachedInstagramPlayback(row.payload, new Date(row.expires_at).getTime())) {
      if ((media.get(shortcode)?.expiresAt ?? 0) < source.expiresAt) media.set(shortcode, source);
    }
  }
  return Object.fromEntries(media);
}, ["instagram-playback-cache-v1"], { revalidate: 30 });

/** Cache-only lookup: viewer hovers never reserve credits or contact Social Fetch. */
export async function getCachedInstagramPlayback(shortcode: string): Promise<InstagramPlayback | null> {
  const apiKey = process.env.SOCIAL_FETCH_API_KEY?.trim();
  if (!apiKey) return null;
  const handles = new Set([
    GROUP.socials.instagram.handle,
    ...MEMBERS.flatMap((member) => member.socials.filter((social) => social.platform === "instagram").map((social) => social.handle ?? "")),
  ].map((handle) => handle.replace(/^@+/, "").toLowerCase()).filter((handle) => /^[a-z0-9._]{1,64}$/.test(handle)));
  const keys = [...handles].flatMap((handle) => ["posts", "reels"].map((collection) =>
    socialFetchRequestKey(`https://api.socialfetch.dev/v1/instagram/profiles/${handle}/${collection}`, apiKey)));
  try {
    const media = (await readSnapshot(keys))[shortcode];
    return media && media.expiresAt > Date.now() ? media : null;
  } catch { return null; }
}
