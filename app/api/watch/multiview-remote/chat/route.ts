import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { query } from "@/lib/db";
import { getHomeWatchCatalog } from "@/lib/watch/catalog";
import { itemToPlayable } from "@/lib/watch/playable";
import { MULTIVIEW_REMOTE_LEASE_SECONDS } from "@/lib/watch/multiview-remote";
import { subscribeToYouTubeRemoteChat } from "@/lib/watch/youtube-remote-chat";

export const runtime = "nodejs";
const Params = z.object({ session: z.string().uuid(), video: z.string().regex(/^[\w-]{11}$/) });
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  const user = await getCurrentFanUserId();
  if (!user) return new Response(null, { status: 401, headers: privateHeaders });
  const search = new URL(request.url).searchParams;
  const params = Params.safeParse({ session: search.get("session"), video: search.get("video") });
  if (!params.success) return new Response(null, { status: 400, headers: privateHeaders });
  const { session, video } = params.data;
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) return new Response(null, { status: 503, headers: privateHeaders });
  try {
    const { rows } = await query(
      `SELECT id FROM fan_multiview_sessions
        WHERE user_id = $1 AND id = $2 AND NOT ended
          AND updated_at > now() - interval '${MULTIVIEW_REMOTE_LEASE_SECONDS} seconds' AND sources @> $3::jsonb`,
      [user, session, JSON.stringify([{ platform: "youtube", videoId: video }])],
    );
    if (!rows.length) return new Response(null, { status: 404, headers: privateHeaders });
    const catalog = await getHomeWatchCatalog();
    if (!catalog.live.some((item) => item.platform === "youtube" && item.memberSlug && itemToPlayable(item)?.youtubeId === video)) {
      return new Response(null, { status: 404, headers: privateHeaders });
    }
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const push = (value: string) => {
        if (!closed && (controller.desiredSize ?? 0) > 0) controller.enqueue(encoder.encode(value));
      };
      const unsubscribe = subscribeToYouTubeRemoteChat(video, key, (event) => {
        push(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === "unavailable") queueMicrotask(() => cleanup());
      });
      const ping = setInterval(() => push(": keepalive\n\n"), 15000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        request.signal.removeEventListener("abort", cleanup);
        unsubscribe();
        try { controller.close(); } catch { /* The reader already disconnected. */ }
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
      if (request.signal.aborted) cleanup();
    },
    cancel() { cleanup(); },
  }, { highWaterMark: 8 });
  return new Response(body, { headers: {
    ...privateHeaders, "Content-Type": "text/event-stream", "X-Accel-Buffering": "no",
  } });
}
