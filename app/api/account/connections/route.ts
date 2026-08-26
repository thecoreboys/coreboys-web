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
    catalog: PROVIDER_CATALOG.map((p) => ({
      ...p,
      configured: p.connectable ? providerConfigured(p.key as OauthProvider) : false,
    })),
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
