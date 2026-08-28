import "server-only";
import { isLikelyYouTubeShort } from "@/lib/youtube-classification";

/** First-party YouTube metadata used to classify watch cards. */

/** YouTube Data API caps videos.list at 50 ids per request. */
const BATCH = 50;

export type YouTubeVideoMetadata = {
  duration: string;
  durationSeconds: number;
  /**
   * YouTube does not expose an explicit `isShort` field. This is therefore
   * a conservative duration/text heuristic, not a claim about the video's
   * server-side Shorts shelf placement.
   */
  isShort: boolean;
  liveBroadcastContent: "live" | "upcoming" | "none";
};

/** Parse the subset of ISO-8601 durations returned by YouTube. */
export function isoDurationSeconds(iso: string): number | null {
  const m = /^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso.trim());
  if (!m) return null;
  const hours = Number(m[1] ?? 0);
  const minutes = Number(m[2] ?? 0);
  const seconds = Number(m[3] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

export function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "";
  const total = Math.floor(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

/**
 * Fetch duration/live metadata in quota-efficient 50-id batches.
 * Missing credentials and partial upstream failures intentionally resolve to
 * an empty/partial map so public RSS remains the no-credential fallback.
 * Webhook callers can request a fresh read so a just-published id is never
 * classified from an older cached API response.
 */
export async function fetchYouTubeMetadata(
  videoIds: string[],
  titleById: Readonly<Record<string, string>> = {},
  options: { fresh?: boolean } = {},
): Promise<Record<string, YouTubeVideoMetadata>> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return {};

  const ids = Array.from(new Set(videoIds.filter(Boolean)));
  if (ids.length === 0) return {};

  const out: Record<string, YouTubeVideoMetadata> = {};

  try {
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const params = new URLSearchParams({
        part: "contentDetails,snippet",
        id: batch.join(","),
        key,
      });
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
        ...(options.fresh
          ? { cache: "no-store" as const }
          : { next: { revalidate: 86_400 } }),
      });
      if (!res.ok) continue;

      const json = (await res.json()) as {
        items?: Array<{
          id?: string;
          contentDetails?: { duration?: string };
          snippet?: {
            title?: string;
            description?: string;
            tags?: string[];
            liveBroadcastContent?: "live" | "upcoming" | "none";
          };
        }>;
      };

      for (const item of json.items ?? []) {
        const id = item.id;
        const iso = item.contentDetails?.duration;
        if (!id || !iso) continue;
        const durationSeconds = isoDurationSeconds(iso);
        if (!durationSeconds) continue;
        const duration = formatDurationSeconds(durationSeconds);
        const title = item.snippet?.title ?? titleById[id] ?? "";
        const isShort = isLikelyYouTubeShort({
          durationSeconds,
          title,
          description: item.snippet?.description,
          tags: item.snippet?.tags,
        });
        out[id] = {
          duration,
          durationSeconds,
          isShort,
          liveBroadcastContent: item.snippet?.liveBroadcastContent ?? "none",
        };
      }
    }
  } catch {
    return out;
  }

  return out;
}

/**
 * Fetch durations for a set of YouTube video ids.
 * @returns map of `videoId → "12:34"` (only for ids that resolved).
 */
export async function fetchDurations(
  videoIds: string[],
): Promise<Record<string, string>> {
  const metadata = await fetchYouTubeMetadata(videoIds);
  return Object.fromEntries(Object.entries(metadata).map(([id, item]) => [id, item.duration]));
}

/**
 * Parse an ISO-8601 duration (e.g. `PT1H2M3S`, `PT12M4S`, `PT45S`) into a
 * compact clock string:
 *   - `< 1h`  → `M:SS`   (e.g. "12:04")
 *   - `>= 1h` → `H:MM:SS` (e.g. "1:02:03")
 * Returns "" for unparseable / zero-length input.
 */
export function formatIsoDuration(iso: string): string {
  const total = isoDurationSeconds(iso);
  return total ? formatDurationSeconds(total) : "";
}
