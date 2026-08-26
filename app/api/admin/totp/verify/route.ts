import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  buildClearMfaChallengeCookie,
  buildSessionCookie,
  MFA_CHALLENGE_COOKIE,
  signSessionToken,
  verifyMfaChallengeToken,
} from "@/lib/admin-auth";
import { completeTotpChallenge, TotpChallengeError } from "@/lib/admin-totp";
import { staffLandingPath } from "@/lib/staff-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the six-digit code."),
  next: z.string().max(2048).nullable().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid code" }, { status: 400 });
  const store = await cookies();
  const raw = store.get(MFA_CHALLENGE_COOKIE)?.value;
  const pending = raw ? await verifyMfaChallengeToken(raw) : null;
  if (!pending) return NextResponse.json({ error: "Two-factor sign-in has expired. Sign in again." }, { status: 401 });

  try {
    const result = await completeTotpChallenge(pending.challengeId, pending.email, parsed.data.code);
    const token = await signSessionToken(result.email, { mfa: true, sessionVersion: result.sessionVersion });
    const res = NextResponse.json({ ok: true, redirectTo: staffLandingPath("admin", parsed.data.next) });
    res.headers.append("Set-Cookie", buildSessionCookie(token));
    res.headers.append("Set-Cookie", buildClearMfaChallengeCookie());
    return res;
  } catch (error) {
    if (error instanceof TotpChallengeError) {
      const message = error.code === "locked"
        ? "Too many incorrect codes. Sign in again."
        : error.code === "expired"
          ? "Two-factor sign-in has expired. Sign in again."
          : "That code is not valid. Try the current code from your authenticator.";
      return NextResponse.json({ error: message }, { status: error.code === "invalid" ? 401 : 429 });
    }
    throw error;
  }
}
