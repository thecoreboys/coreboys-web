import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "@/lib/db";
import {
  buildMfaChallengeCookie,
  buildSessionCookie,
  signMfaChallengeToken,
  signSessionToken,
} from "@/lib/admin-auth";
import { consumeAdminLoginRateLimit } from "@/lib/admin-login-rate-limit";
import { createTotpChallenge, TotpConfigurationError } from "@/lib/admin-totp";
import { MEMBERS } from "@/lib/members";
import { isStaffRole, staffAssignmentIsValid, staffLandingPath } from "@/lib/staff-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
  next: z.string().max(2048).nullable().optional(),
});

const MEMBER_SLUGS = new Set(MEMBERS.map((member) => member.slug));

type LoginStaff = {
  id: string;
  password_hash: string;
  role: string;
  member_slug: string | null;
  display_name: string;
  session_version: number;
  totp_enabled: boolean;
};

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const email = body.email.toLowerCase();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
  const [ipLimit, emailLimit] = await Promise.all([
    consumeAdminLoginRateLimit(`admin-login:ip:${ip}`, 12),
    consumeAdminLoginRateLimit(`admin-login:email:${email}`, 5),
  ]);
  if (!ipLimit.ok || !emailLimit.ok) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds)) } },
    );
  }

  const result = await query<LoginStaff>(
    `SELECT id::text, password_hash, role, member_slug, display_name,
            session_version, totp_enabled
       FROM admin_users
      WHERE email = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [email],
  );
  const staff = result.rows[0];
  if (!staff || !await bcrypt.compare(body.password, staff.password_hash)) {
    return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
  }
  if (!isStaffRole(staff.role) || !staffAssignmentIsValid(staff.role, staff.member_slug, MEMBER_SLUGS)) {
    return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
  }

  const redirectTo = staffLandingPath(staff.role, body.next);
  if (staff.role === "admin") {
    try {
      const challenge = await createTotpChallenge(staff.id, staff.totp_enabled ? "verify" : "enroll");
      const pendingToken = await signMfaChallengeToken(email, challenge.id);
      const res = NextResponse.json({
        ok: true,
        requiresTwoFactor: true,
        mode: staff.totp_enabled ? "verify" : "enroll",
        email,
        displayName: staff.display_name,
        redirectTo,
      });
      res.headers.set("Set-Cookie", buildMfaChallengeCookie(pendingToken));
      return res;
    } catch (error) {
      if (error instanceof TotpConfigurationError) {
        return NextResponse.json({ error: "Two-factor authentication is not configured on this server." }, { status: 503 });
      }
      throw error;
    }
  }

  const token = await signSessionToken(email, { mfa: false, sessionVersion: staff.session_version });
  const res = NextResponse.json({
    ok: true,
    email,
    displayName: staff.display_name,
    role: staff.role,
    memberSlug: staff.member_slug,
    redirectTo,
  });
  res.headers.set("Set-Cookie", buildSessionCookie(token));
  return res;
}
