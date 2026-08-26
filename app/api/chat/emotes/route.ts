import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { fetchUserTwitchEmotes } from "@/lib/oauth/twitch-emotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET() {
  const userId = await getCurrentFanUserId();
  if (!userId) {
    return privateJson({ error: "Sign in to load your Twitch emotes." }, 401);
  }
  return privateJson(await fetchUserTwitchEmotes(userId));
}
