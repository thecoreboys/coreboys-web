import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { sendYoutubeInteraction } from "@/lib/oauth/youtube-interaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["comment", "live_chat"]),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{6,32}$/),
  message: z.string().trim().min(1).max(200),
});

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(req: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return json({ ok: false, error: "Sign in to use your YouTube account." }, 401);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return json({ ok: false, error: "Invalid YouTube message." }, 400);
  }

  let result: Awaited<ReturnType<typeof sendYoutubeInteraction>>;
  try {
    result = await sendYoutubeInteraction(userId, body);
  } catch {
    return json({ ok: false, error: "YouTube messaging is temporarily unavailable." }, 503);
  }
  if (result.ok) return json(result);
  if (result.retryAfterMs) {
    const response = json(result, 429);
    response.headers.set("Retry-After", String(Math.ceil(result.retryAfterMs / 1_000)));
    return response;
  }
  return json(result, result.needsReconnect ? 403 : 400);
}
