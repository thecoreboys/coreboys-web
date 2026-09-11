import { NextResponse } from "next/server";
import { accountRequestMatches, ACCOUNT_CHANGED_MESSAGE } from "@/lib/account-request";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { isOauthProvider } from "@/lib/oauth/providers";
import { deleteConnection, getConnection } from "@/lib/oauth/connections";
import {
  disconnectOauthProvider,
  revokeTikTokAccess,
} from "@/lib/oauth/disconnect";
import { accessTokenFor } from "@/lib/oauth/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Disconnect: wipe tokens + inferred loyalty for this provider. Keeps the CORE account. */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;
  if (!isOauthProvider(provider)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!accountRequestMatches(req, uid)) return NextResponse.json({ error: "account_changed", message: ACCOUNT_CHANGED_MESSAGE }, { status: 409 });
  const connection = await getConnection(uid, provider);
  if (!connection) return NextResponse.json({ ok: true, accountId: uid });
  let disconnected = false;
  let providerRevokeFailed = false;
  try {
  await disconnectOauthProvider(provider, {
    loadTikTokAccessToken: async () => {
      const current = await accessTokenFor(uid, "tiktok");
      return current?.row.id === connection.id ? current.token : null;
    },
    revokeTikTok: revokeTikTokAccess,
    deleteLocalConnection: async () => {
      await deleteConnection(uid, provider, connection.id);
      disconnected = true;
    },
  });
  } catch (error) {
    if (!disconnected) throw error;
    // The grant and facts are already gone from CORE. A provider outage must
    // not leave the UI claiming that a disconnected account is still linked.
    providerRevokeFailed = true;
  }
  return NextResponse.json({ ok: true, providerRevokeFailed, accountId: uid });
}
