import { NextResponse } from "next/server";
import { INVALID_RESET_LINK, passwordResetTokenSchema } from "@/lib/auth/password-reset";
import { limitFanAuth } from "@/lib/fan-auth-rate-limit";
import { isPasswordResetTokenValid } from "@/lib/password-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const parsed = passwordResetTokenSchema.safeParse(body?.token);
  if (!parsed.success) return NextResponse.json({ error: INVALID_RESET_LINK, code: "invalid_reset_link" }, { status: 400 });
  const limited = await limitFanAuth(request, "reset-password", parsed.data);
  if (limited) return limited;
  try {
    const valid = await isPasswordResetTokenValid(parsed.data);
    return NextResponse.json(valid ? { valid: true } : { error: INVALID_RESET_LINK, code: "invalid_reset_link" }, {
      status: valid ? 200 : 400, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "We couldn’t check your reset link. Please try again in a moment." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
