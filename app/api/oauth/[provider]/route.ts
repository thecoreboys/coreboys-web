import { NextResponse } from "next/server";
import { accountRequestMatches, ACCOUNT_CHANGED_MESSAGE } from "@/lib/account-request";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { isOauthProvider } from "@/lib/oauth/providers";
import { deleteConnection, getConnection, readRefreshToken, readAccessToken } from "@/lib/oauth/connections";
import {
  disconnectOauthProvider,
  revocationTokenKind,
  revokeProviderToken,
  revokeTikTokAccess,
  type RevocableToken,
} from "@/lib/oauth/disconnect";
import { accessTokenFor } from "@/lib/oauth/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Disconnect: revoke the grant at the provider where supported, then wipe
 * tokens + inferred loyalty for this provider. Keeps the CORE account.
 */
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
    loadRevocableToken: async (): Promise<RevocableToken | null> => {
      const kind = revocationTokenKind(provider);
      if (kind === "live-access") {
        const current = await accessTokenFor(uid, provider);
        return current?.row.id === connection.id ? { token: current.token, kind: "access_token" } : null;
      }
      if (kind === "refresh-first") {
        const refresh = readRefreshToken(connection);
        if (refresh) return { token: refresh, kind: "refresh_token" };
        return connection.access_token_enc ? { token: readAccessToken(connection), kind: "access_token" } : null;
      }
      return null;
    },
    revoke: (credential) => provider === "tiktok"
      ? revokeTikTokAccess(credential.token)
      : provider === "instagram"
        ? Promise.resolve()
        : revokeProviderToken(provider, credential),
    deleteLocalConnection: async () => {
      await deleteConnection(uid, provider, connection.id);
      disconnected = true;
    },
  });
  } catch (error) {
    if (!disconnected) throw error;
    console.warn("[oauth/disconnect] provider revocation failed", provider);
    // The grant and facts are already gone from CORE. A provider outage must
    // not leave the UI claiming that a disconnected account is still linked.
    providerRevokeFailed = true;
  }
  return NextResponse.json({ ok: true, providerRevokeFailed, accountId: uid });
}
