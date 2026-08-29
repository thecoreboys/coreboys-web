import { NextResponse } from "next/server";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { bestWatchProgressMark, isContinueWatchingMark } from "@/lib/watch/continue-watching";
import { catalogPlayables } from "@/lib/watch/playable";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { listProgress, type ProgressRow } from "@/lib/watch/progress";
import { query } from "@/lib/db";
import { listWatchFeedback, type WatchFeedbackRow } from "@/lib/watch/feedback";
import type { AutoplayMode } from "@/lib/watch/workspace";
import type { Playable } from "@/lib/watch/playable";
import {
  isShortFormQueuePlayable,
  watchQueueResponseOptions,
} from "@/lib/watch/queue-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function playableRefs(item: Playable): string[] {
  return [...new Set([item.key, item.youtubeId].filter((value): value is string => Boolean(value)))];
}

function bestMark(item: Playable, marks: Map<string, ProgressRow>) {
  return bestWatchProgressMark(playableRefs(item).map((reference) => marks.get(reference)));
}

function addAffinity(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const catalog = await getWatchCatalog();
    const { excluded, shortFormOnly, responseLimit } = watchQueueResponseOptions(params);
    const userId = await getCurrentFanUserId();
    const requestedMode = params.get("mode");
    const mode: AutoplayMode = ["off", "queue", "same-creator", "similar", "live-first", "keep-grid-full"].includes(requestedMode ?? "")
      ? requestedMode as AutoplayMode
      : "live-first";
    const fromMember = params.get("member");
    const fromPlatform = params.get("platform");
    const fromFormat = params.get("format");
    let favorite: string | null = null;
    let progress = new Map<string, ProgressRow>();
    let feedback: WatchFeedbackRow[] = [];
    if (userId) {
      const [marks, user, feedbackRows] = await Promise.all([
        listProgress(userId).catch(() => []),
        query<{ favorite_member: string | null }>(
          `SELECT favorite_member FROM fan_users WHERE id = $1`,
          [userId],
        ).catch(() => ({ rows: [] })),
        listWatchFeedback(userId).catch(() => []),
      ]);
      progress = new Map(marks.map((mark) => [mark.ref, mark]));
      favorite = user.rows[0]?.favorite_member ?? null;
      feedback = feedbackRows;
    }
    const feedbackMap = new Map(feedback.map((entry) => [`${entry.scope}:${entry.value}`, entry.signal]));
    const now = Date.now();
    const playables = catalogPlayables(catalog);
    const itemByProgressRef = new Map<string, Playable>();
    for (const item of playables) {
      for (const reference of playableRefs(item)) itemByProgressRef.set(reference, item);
    }
    const creatorAffinity = new Map<string, number>();
    const platformAffinity = new Map<string, number>();
    const formatAffinity = new Map<string, number>();
    for (const mark of progress.values()) {
      const watched = itemByProgressRef.get(mark.ref);
      if (!watched) continue;
      const ageMs = Math.max(0, now - Date.parse(mark.updatedAt));
      const recency = Number.isFinite(ageMs)
        ? Math.max(0.2, Math.exp(-ageMs / (45 * 86_400_000)))
        : 0.2;
      // Actual play time dominates; hovers are a deliberately weak signal.
      const activity = (
        Math.log2(1 + mark.seconds / 15) * 60 +
        mark.progress * 100 +
        (mark.completed ? 30 : 0) +
        Math.min(20, mark.hoverCount) * 2
      ) * recency;
      addAffinity(creatorAffinity, watched.memberSlug ?? "house", activity);
      addAffinity(platformAffinity, watched.platform, activity);
      addAffinity(formatAffinity, watched.format ?? watched.kind, activity);
    }
    const creatorMax = Math.max(1, ...creatorAffinity.values());
    const platformMax = Math.max(1, ...platformAffinity.values());
    const formatMax = Math.max(1, ...formatAffinity.values());

    const items = playables
      .filter((item) => {
        if (excluded.has(item.key)) return false;
        if (shortFormOnly && !isShortFormQueuePlayable(item)) return false;
        if ((feedbackMap.get(`item:${item.key}`) ?? 0) <= -2) return false;
        if (item.memberSlug && (feedbackMap.get(`creator:${item.memberSlug}`) ?? 0) <= -2) return false;
        if ((feedbackMap.get(`platform:${item.platform}`) ?? 0) <= -2) return false;
        return true;
      })
      .map((item, index) => {
        const mark = bestMark(item, progress);
        const continueWatching = isContinueWatchingMark(mark, now);
        const published = item.publishedAt ? Date.parse(item.publishedAt) : 0;
        const freshness = Number.isFinite(published)
          ? Math.max(0, 1_000 - (now - published) / 86_400_000)
          : 0;
        const liveWeight = mode === "live-first" || mode === "keep-grid-full" ? 1_000_000 : 1_000;
        const sameCreator = Boolean(fromMember && item.memberSlug === fromMember);
        const samePlatform = Boolean(fromPlatform && item.platform === fromPlatform);
        const sameFormat = Boolean(fromFormat && item.format === fromFormat);
        const modeScore = mode === "same-creator"
          ? (sameCreator ? 250_000 : 0)
          : mode === "similar"
            ? (sameCreator ? 90_000 : 0) + (samePlatform ? 35_000 : 0) + (sameFormat ? 25_000 : 0)
            : 0;
        const itemSignal = feedbackMap.get(`item:${item.key}`) ?? 0;
        const creatorSignal = creatorAffinity.get(item.memberSlug ?? "house") ?? 0;
        const platformSignal = platformAffinity.get(item.platform) ?? 0;
        const formatSignal = formatAffinity.get(item.format ?? item.kind) ?? 0;
        const affinityScore =
          (creatorSignal / creatorMax) * 12_000 +
          (platformSignal / platformMax) * 4_000 +
          (formatSignal / formatMax) * 4_000;
        const score =
          (item.kind === "live" ? liveWeight : 0) +
          modeScore +
          (favorite && item.memberSlug === favorite ? 10_000 : 0) +
          (continueWatching ? 5_000 : 0) -
          (mark?.completed ? 20_000 : 0) +
          affinityScore +
          itemSignal * 8_000 +
          freshness -
          index / 1_000;
        const recommendationReason = item.kind === "live"
          ? "Live right now"
          : mode === "same-creator" && sameCreator
            ? `More from ${item.memberLabel}`
            : mode === "similar" && sameCreator
              ? `Because you were watching ${item.memberLabel}`
              : mode === "similar" && sameFormat
                ? `More ${item.format === "short" ? "short-form" : item.format ?? "similar"} content`
                : continueWatching
                  ? "Continue where you left off"
                  : favorite && item.memberSlug === favorite
                    ? `From your favorite, ${item.memberLabel}`
                    : creatorSignal > 0 && item.memberSlug
                      ? `Because you watch ${item.memberLabel}`
                      : platformSignal > 0
                        ? `From your ${item.platform === "x" ? "X" : item.platform} mix`
                        : formatSignal > 0 && item.format === "short"
                          ? "More short-form picks"
                    : freshness > 970
                      ? "Recently added"
                      : "Picked from the CORE catalog";
        return { item: { ...item, recommendationReason }, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
    const responseItems = responseLimit === null ? items : items.slice(0, responseLimit);
    const response = NextResponse.json({ items: responseItems });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    const response = NextResponse.json({ items: [] });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
