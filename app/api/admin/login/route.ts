import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "@/lib/db";
import { signSessionToken, buildSessionCookie } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const email = body.email.toLowerCase();
  const result = await query<{ password_hash: string }>(
    `SELECT password_hash FROM admin_users
     WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
    [email],
  );
  const hash = result.rows[0]?.password_hash;
  if (!hash) {
    // Same response shape as a wrong password so we don't leak which
    // emails are registered.
    return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
  }

  const ok = await bcrypt.compare(body.password, hash);
  if (!ok) {
    return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
  }

  const token = await signSessionToken(email);
  const res = NextResponse.json({ ok: true, email });
  res.headers.set("Set-Cookie", buildSessionCookie(token));
  return res;
}
