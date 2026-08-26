import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { deleteConnectionByProviderUser } from "@/lib/oauth/connections";
import { verifyMetaSignedRequest } from "@/lib/meta/signed-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_SITE_ORIGIN = "https://thecoreboys.com";

function appSecret(): string | null {
  return (
    process.env.INSTAGRAM_CLIENT_SECRET ||
    process.env.FACEBOOK_APP_SECRET ||
    null
  );
}

function statusUrl(confirmationCode: string): string {
  let origin = FALLBACK_SITE_ORIGIN;
  try {
    const configured = process.env.NEXT_PUBLIC_SITE_URL;
    if (configured) origin = new URL(configured).origin;
  } catch {
    // Keep the production-safe canonical fallback when an env value is bad.
  }
  const url = new URL("/legal/data-deletion", origin);
  url.searchParams.set("code", confirmationCode);
  return url.toString();
}

function noStoreJson(body: unknown, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

/** Meta posts an HMAC-signed, app-scoped user id as form data. */
export async function POST(request: Request) {
  const secret = appSecret();
  if (!secret) {
    return noStoreJson({ error: "callback_not_configured" }, 503);
  }

  let signedRequest: string | null = null;
  try {
    const form = await request.formData();
    const value = form.get("signed_request");
    signedRequest = typeof value === "string" ? value : null;
  } catch {
    return noStoreJson({ error: "invalid_signed_request" }, 400);
  }

  const verified = signedRequest
    ? verifyMetaSignedRequest(signedRequest, secret)
    : null;
  if (!verified) {
    return noStoreJson({ error: "invalid_signed_request" }, 401);
  }

  // Do not reveal whether the app-scoped id existed. A valid request is
  // complete once its encrypted Instagram tokens and derived loyalty rows
  // have been removed (or were already absent).
  await deleteConnectionByProviderUser("instagram", verified.userId);

  const confirmationCode = randomBytes(16).toString("hex");
  return noStoreJson(
    {
      url: statusUrl(confirmationCode),
      confirmation_code: confirmationCode,
    },
    200,
  );
}

/** A browser-safe description for operators checking the configured URL. */
export function GET() {
  return noStoreJson(
    {
      service: "The CORE Boys Meta user-data deletion callback",
      method: "POST",
      instructions: `${FALLBACK_SITE_ORIGIN}/legal/data-deletion`,
    },
    200,
  );
}
