import { NextResponse } from "next/server";
import {
  createSiteAccessToken,
  SITE_ACCESS_COOKIE,
  SITE_ACCESS_MAX_AGE_SECONDS,
  siteAccessCodeMatches,
  siteAccessGateEnabled,
  siteAccessSubjectKey,
} from "@/lib/site-access";
import {
  clearSiteAccessRateLimit,
  consumeSiteAccessRateLimit,
} from "@/lib/site-access-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, private, max-age=0");
  return response;
}

export async function POST(request: Request) {
  if (!siteAccessGateEnabled()) {
    return noStore(NextResponse.json({ error: "Access gate is not enabled." }, { status: 404 }));
  }

  const ip = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";

  try {
    const subjectKey = await siteAccessSubjectKey(ip);
    const limit = await consumeSiteAccessRateLimit(subjectKey);
    if (!limit.ok) {
      const response = NextResponse.json(
        { error: "Too many attempts. Try again later.", retryAfterSeconds: limit.retryAfterSeconds },
        { status: 429 },
      );
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return noStore(response);
    }

    const payload = await request.json().catch(() => null) as { code?: unknown } | null;
    const code = typeof payload?.code === "string" ? payload.code.trim() : "";
    if (!/^\d{6}$/.test(code) || !await siteAccessCodeMatches(code)) {
      return noStore(NextResponse.json({ error: "That access code is not valid." }, { status: 401 }));
    }

    const token = await createSiteAccessToken();
    if (!token) throw new Error("access_token_unavailable");
    await clearSiteAccessRateLimit(subjectKey);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SITE_ACCESS_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: SITE_ACCESS_MAX_AGE_SECONDS,
    });
    return noStore(response);
  } catch {
    return noStore(NextResponse.json(
      { error: "Access verification is temporarily unavailable." },
      { status: 503 },
    ));
  }
}
