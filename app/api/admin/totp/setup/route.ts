import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MFA_CHALLENGE_COOKIE, verifyMfaChallengeToken } from "@/lib/admin-auth";
import { buildTotpUri, getEnrollmentSecret, TotpChallengeError } from "@/lib/admin-totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns the one-time manual key only during the password-authenticated enrollment window. */
export async function GET() {
  const store = await cookies();
  const token = store.get(MFA_CHALLENGE_COOKIE)?.value;
  const pending = token ? await verifyMfaChallengeToken(token) : null;
  if (!pending) return NextResponse.json({ error: "Two-factor setup has expired. Sign in again." }, { status: 401 });
  try {
    const secret = await getEnrollmentSecret(pending.challengeId, pending.email);
    return NextResponse.json({
      issuer: "CORE Staff",
      accountName: pending.email,
      manualKey: secret,
      otpauthUrl: buildTotpUri(pending.email, secret),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TotpChallengeError) {
      return NextResponse.json({ error: "Two-factor setup has expired. Sign in again." }, { status: 401 });
    }
    throw error;
  }
}
