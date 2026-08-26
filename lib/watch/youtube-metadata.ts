import "server-only";
import { formatDurationSeconds, isoDurationSeconds } from "@/lib/youtube-duration";
import type { WatchChapter } from "./types";

export type WatchYoutubeMetadata = {
  duration?: string;
  durationSeconds?: number;
  isShort: boolean;
  liveBroadcastContent: "live" | "upcoming" | "none";
  actualStartTime?: string;
  scheduledStartTime?: string;
  chapters?: WatchChapter[];
  relatedFullVideoId?: string;
};

function linkedYoutubeVideo(description: string, currentId: string): string | undefined {
  const matches = description.matchAll(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^\s#]*&)?v=|embed\/))([0-9A-Za-z_-]{6,})/gi,
  );
  for (const match of matches) {
    if (match[1] && match[1] !== currentId) return match[1];
  }
  return undefined;
}

function clockSeconds(value: string): number | null {
  const parts = value.split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const seconds = parts.length === 3
    ? parts[0]! * 3_600 + parts[1]! * 60 + parts[2]!
    : parts[0]! * 60 + parts[1]!;
  return seconds >= 0 ? seconds : null;
}

/** Parse real timestamp markers from a YouTube description. */
export function parseYoutubeChapters(
  description: string,
  durationSeconds?: number,
): WatchChapter[] {
  const found = description.split(/\r?\n/).flatMap((raw) => {
    const line = raw.trim();
    const leading = /^(?:[-*•]\s*)?(?:\[\s*)?((?:(?:\d{1,2}):)?\d{1,2}:\d{2})(?:\s*\])?\s*(?:[-–—|:]\s*)?(.*)$/.exec(line);
    const trailing = leading ? null : /^(.*?)\s+((?:(?:\d{1,2}):)?\d{1,2}:\d{2})\s*$/.exec(line);
    const clock = leading?.[1] ?? trailing?.[2];
    const title = (leading?.[2] ?? trailing?.[1] ?? "").trim().replace(/^[-–—|:]\s*/, "");
    const startSeconds = clock ? clockSeconds(clock) : null;
    if (startSeconds == null || !title || (durationSeconds && startSeconds >= durationSeconds)) return [];
    return [{ title: title.slice(0, 100), startSeconds }];
  });
  const sorted = [...new Map(found.map((chapter) => [chapter.startSeconds, chapter])).values()]
    .sort((a, b) => a.startSeconds - b.startSeconds);
  // YouTube's chapter contract starts at 0:00 and requires multiple markers.
  if (sorted.length < 2 || sorted[0]!.startSeconds > 10) return [];
  return sorted.map((chapter, index) => {
    const title = chapter.title;
    const kind: WatchChapter["kind"] = /\b(?:intro|opening|previously)\b/i.test(title)
      ? "intro"
      : /\b(?:credits|outro|end card)\b/i.test(title)
        ? "credits"
        : "chapter";
    return {
      ...chapter,
      kind,
      endSeconds: sorted[index + 1]?.startSeconds ?? durationSeconds,
    };
  });
}

/**
 * Catalog-specific metadata. Unlike the generic duration helper, this keeps
 * current/upcoming live state even while a broadcast has no final duration.
 */
export async function fetchWatchYoutubeMetadata(
  videoIds: readonly string[],
  titleById: Readonly<Record<string, string>> = {},
): Promise<Record<string, WatchYoutubeMetadata>> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return {};
  const ids = [...new Set(videoIds.filter(Boolean))];
  const output: Record<string, WatchYoutubeMetadata> = {};

  try {
    for (let index = 0; index < ids.length; index += 50) {
      const batch = ids.slice(index, index + 50);
      const params = new URLSearchParams({
        part: "contentDetails,snippet,liveStreamingDetails",
        id: batch.join(","),
        key,
      });
      const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
        next: { revalidate: 600 },
      });
      if (!response.ok) continue;
      const json = (await response.json()) as {
        items?: Array<{
          id?: string;
          contentDetails?: { duration?: string };
          snippet?: {
            title?: string;
            description?: string;
            tags?: string[];
            liveBroadcastContent?: "live" | "upcoming" | "none";
          };
          liveStreamingDetails?: {
            actualStartTime?: string;
            scheduledStartTime?: string;
          };
        }>;
      };

      for (const item of json.items ?? []) {
        if (!item.id) continue;
        const durationSeconds = item.contentDetails?.duration
          ? isoDurationSeconds(item.contentDetails.duration) ?? undefined
          : undefined;
        const title = item.snippet?.title ?? titleById[item.id] ?? "";
        const shortSignals = [
          title,
          item.snippet?.description ?? "",
          ...(item.snippet?.tags ?? []),
        ].join(" ");
        output[item.id] = {
          duration: durationSeconds ? formatDurationSeconds(durationSeconds) : undefined,
          durationSeconds,
          isShort:
            Boolean(durationSeconds && durationSeconds <= 60) ||
            Boolean(
              durationSeconds &&
                durationSeconds <= 180 &&
                /(?:^|\s)#?shorts?(?:\s|$|[.!?])/i.test(shortSignals),
            ),
          liveBroadcastContent: item.snippet?.liveBroadcastContent ?? "none",
          actualStartTime: item.liveStreamingDetails?.actualStartTime,
          scheduledStartTime: item.liveStreamingDetails?.scheduledStartTime,
          chapters: parseYoutubeChapters(item.snippet?.description ?? "", durationSeconds),
          relatedFullVideoId: linkedYoutubeVideo(item.snippet?.description ?? "", item.id),
        };
      }
    }
  } catch {
    return output;
  }

  return output;
}
