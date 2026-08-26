import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { setLoyalty } from "@/lib/oauth/loyalty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ attested: z.boolean() });

export async function POST(req: Request) {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await setLoyalty({
    userId: uid,
    platform: "x",
    subject: "house",
    kind: "community",
    value: body.attested,
    meta: { method: "self-attest", note: "X Communities API is gated" },
  });
  return NextResponse.json({ ok: true, attested: body.attested });
}
