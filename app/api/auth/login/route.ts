import { NextResponse } from "next/server";
import { loginSchema, getFanUserByEmail, verifyPassword } from "@/lib/fan-users";
import { signFanSessionToken, buildFanSessionCookie } from "@/lib/fan-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let row;
  try {
    row = await getFanUserByEmail(parsed.data.email);
  } catch {
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Try again in a moment." },
      { status: 503 },
    );
  }
  if (!row || !(await verifyPassword(parsed.data.password, row.password_hash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await signFanSessionToken(row.id);
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
