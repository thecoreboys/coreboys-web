import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { consumeAdminLoginRateLimit } from "@/lib/admin-login-rate-limit";
import { siteAccessClientIp } from "@/lib/site-access-rate-limit";

const LIMITS = {
  login: { ip: 30, account: 8 },
  signup: { ip: 12, account: 4 },
  "forgot-password": { ip: 12, account: 4 },
  "reset-password": { ip: 30, account: 10 },
} as const;

/** Shared database-backed counters protect account actions across replicas. */
export async function limitFanAuth(request: Request, action: keyof typeof LIMITS, email: string): Promise<NextResponse | null> {
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  try {
    const [ip, account] = await Promise.all([
      consumeAdminLoginRateLimit(`fan-${action}:ip:${digest(siteAccessClientIp(request.headers))}`, LIMITS[action].ip),
      consumeAdminLoginRateLimit(`fan-${action}:email:${digest(email.toLowerCase())}`, LIMITS[action].account),
    ]);
    if (!ip.ok || !account.ok) return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.max(ip.retryAfterSeconds, account.retryAfterSeconds)), "Cache-Control": "no-store" } },
    );
    return null;
  } catch {
    return NextResponse.json({ error: "Account access is temporarily unavailable. Please try again later." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
