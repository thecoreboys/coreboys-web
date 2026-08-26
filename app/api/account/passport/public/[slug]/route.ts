import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { PassportError } from "@/lib/passport/policy";
import { getPublicPassportProfile } from "@/lib/passport/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const viewerUserId = await getCurrentFanUserId();
  try {
    const response = NextResponse.json(await getPublicPassportProfile(slug, viewerUserId));
    response.headers.set("Cache-Control", viewerUserId ? "private, no-store" : "public, max-age=60");
    return response;
  } catch (error) {
    if (error instanceof PassportError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("Public Passport profile failed", error);
    return NextResponse.json({ error: "passport_unavailable" }, { status: 500 });
  }
}
