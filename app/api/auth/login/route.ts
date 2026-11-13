import { NextResponse } from "next/server";
import { loginSchema, getFanUserByEmail, verifyPassword } from "@/lib/fan-users";
import { signFanSessionToken, buildFanSessionCookie } from "@/lib/fan-auth";
import { limitFanAuth } from "@/lib/fan-auth-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// bcrypt (10 rounds) hash of a random throwaway value; never matches input.
const TIMING_DUMMY_HASH = "$2b$10$cSMkwKfU0IhkpW2svo1ypuf0w1XJ3DhzD.1D78IKEaVrYwMPWrg.m";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  }

  const limited = await limitFanAuth(req, "login", parsed.data.email);
  if (limited) return limited;

  let row;
  try {
    row = await getFanUserByEmail(parsed.data.email);
  } catch {
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Try again in a moment." },
      { status: 503 },
    );
  }
  // Unknown emails still pay for one bcrypt comparison so response timing
  // does not reveal which addresses have accounts.
  const passwordOk = await verifyPassword(parsed.data.password, row?.password_hash ?? TIMING_DUMMY_HASH);
  if (!row || !passwordOk) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await signFanSessionToken(row.id, row.session_version);
  const res = NextResponse.json({
    user: {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      emailVerified: row.email_verified,
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    },
  });
  res.headers.set("Set-Cookie", buildFanSessionCookie(token));
  return res;
}
