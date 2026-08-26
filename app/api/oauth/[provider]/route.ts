import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { isOauthProvider } from "@/lib/oauth/providers";
import { deleteConnection } from "@/lib/oauth/connections";
import {
  disconnectOauthProvider,
  revokeTikTokAccess,
} from "@/lib/oauth/disconnect";
import { accessTokenFor } from "@/lib/oauth/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Disconnect: wipe tokens + inferred loyalty for this provider. Keeps the CORE account. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;
  if (!isOauthProvider(provider)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await disconnectOauthProvider(provider, {
    loadTikTokAccessToken: async () =>
      (await accessTokenFor(uid, "tiktok"))?.token ?? null,
    revokeTikTok: revokeTikTokAccess,
    deleteLocalConnection: () => deleteConnection(uid, provider),
  });
  return NextResponse.json({ ok: true });
}
