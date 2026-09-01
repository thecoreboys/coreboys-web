import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { listConnections } from "@/lib/oauth/connections";
import {
  PROVIDER_CATALOG,
  providerConfigured,
  type OauthProvider,
} from "@/lib/oauth/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const connections = await listConnections(uid);
  const response = NextResponse.json({
    connections,
    // Instagram content is displayed through public embeds. It is intentionally
    // absent from the new-connection catalog, while an existing grant remains
    // visible so its owner can disconnect it from Account settings.
    catalog: PROVIDER_CATALOG.filter((p) => p.key !== "instagram" || connections.some((connection) => connection.provider === p.key)).map((p) => ({
      ...p,
      configured: p.connectable ? providerConfigured(p.key as OauthProvider) : false,
    })),
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
