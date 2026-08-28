import { NextResponse } from "next/server";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import {
  EmailVerificationRateLimitError,
  getEmailVerificationReadiness,
  requestEmailVerification,
} from "@/lib/email-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function POST() {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const readiness = getEmailVerificationReadiness();
  if (!readiness.ready) {
    return privateJson({ error: "email_delivery_not_ready", readiness }, { status: 503 });
  }
  try {
    return privateJson({ ok: true, ...(await requestEmailVerification(userId)) });
  } catch (error) {
    if (error instanceof EmailVerificationRateLimitError) {
      return privateJson(
        { error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    console.error("email verification request failed", error);
    return privateJson({ error: "verification_send_failed" }, { status: 502 });
  }
}
