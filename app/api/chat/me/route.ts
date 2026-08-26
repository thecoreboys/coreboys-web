import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getConnection } from "@/lib/oauth/connections";
import { providerHasScope } from "@/lib/oauth/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(body: unknown) {
  const response = NextResponse.json(body);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET() {
  const uid = await getCurrentFanUserId();
  if (!uid) {
    return privateJson({ signedIn: false, twitch: null });
  }
  const tw = await getConnection(uid, "twitch");
  const canSend = Boolean(
    tw?.status === "active" &&
    tw.access_token_enc &&
    providerHasScope(tw.scopes, "user:write:chat"),
  );
  const canReadEmotes = Boolean(
    tw?.status === "active" &&
    tw.access_token_enc &&
    providerHasScope(tw.scopes, "user:read:emotes"),
  );
  return privateJson({
    signedIn: true,
    twitch: tw
      ? {
          username: tw.provider_username,
          avatarUrl: tw.avatar_url,
          status: tw.status,
          canSend,
          canReadEmotes,
          needsReconnect: !canSend,
          needsEmoteReconnect: !canReadEmotes,
        }
      : null,
  });
}
