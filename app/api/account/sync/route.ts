import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { listConnections } from "@/lib/oauth/connections";
import { isOauthProvider } from "@/lib/oauth/providers";
import { syncAll, syncProvider } from "@/lib/oauth/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let provider: string | undefined;
  try {
    const body = (await req.json()) as { provider?: string };
    provider = body.provider;
  } catch {
    provider = undefined;
  }

  if (provider) {
    if (!isOauthProvider(provider)) {
      return NextResponse.json({ error: "unknown provider" }, { status: 400 });
    }
    const result = await syncProvider(uid, provider);
    return NextResponse.json({ results: [result] });
  }

  const conns = await listConnections(uid);
  const results = await syncAll(
    uid,
    conns.filter((c) => c.status === "active").map((c) => c.provider),
  );
  return NextResponse.json({ results });
}
