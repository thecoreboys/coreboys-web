import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { consumeAdminLoginRateLimit } from "@/lib/admin-login-rate-limit";
import { siteAccessClientIp } from "@/lib/site-access-rate-limit";

/** Per 15-minute window (the shared limiter's fixed window). */
const LIMITS = {
  profile: { ip: 60, account: 20 },
  password: { ip: 20, account: 6 },
  sessions: { ip: 30, account: 10 },
} as const;

export type AccountActionLimit = keyof typeof LIMITS;

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Database-backed counters for signed-in account changes. Reuses the shared
 * Postgres limiter with an account-scoped key prefix so limits hold across
 * replicas and restarts.
 */
export async function limitAccountAction(
  request: Request,
  action: AccountActionLimit,
  userId: string,
): Promise<NextResponse | null> {
  try {
    const [ip, account] = await Promise.all([
      consumeAdminLoginRateLimit(`fan-account-${action}:ip:${digest(siteAccessClientIp(request.headers))}`, LIMITS[action].ip),
      consumeAdminLoginRateLimit(`fan-account-${action}:user:${digest(userId)}`, LIMITS[action].account),
    ]);
    if (!ip.ok || !account.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes and try again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(ip.retryAfterSeconds, account.retryAfterSeconds)),
            "Cache-Control": "private, no-store",
          },
        },
      );
    }
    return null;
  } catch {
    return NextResponse.json(
      { error: "Account changes are temporarily unavailable. Please try again later." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
