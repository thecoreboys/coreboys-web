import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { consumeAdminLoginRateLimit } from "@/lib/admin-login-rate-limit";
import { siteAccessClientIp } from "@/lib/site-access-rate-limit";

/** Shared database-backed counters protect sign-in and registration across replicas. */
export async function limitFanAuth(request: Request, action: "login" | "signup", email: string): Promise<NextResponse | null> {
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  try {
    const [ip, account] = await Promise.all([
      consumeAdminLoginRateLimit(`fan-${action}:ip:${digest(siteAccessClientIp(request.headers))}`, action === "login" ? 30 : 12),
      consumeAdminLoginRateLimit(`fan-${action}:email:${digest(email.toLowerCase())}`, action === "login" ? 8 : 4),
    ]);
    if (!ip.ok || !account.ok) return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.max(ip.retryAfterSeconds, account.retryAfterSeconds)) } },
    );
    return null;
  } catch {
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again later." }, { status: 503 });
  }
}
