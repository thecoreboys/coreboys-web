import { NextResponse } from "next/server";
import { INVALID_RESET_LINK, resetPasswordSchema } from "@/lib/auth/password-reset";
import { buildClearFanSessionCookie } from "@/lib/fan-auth";
import { limitFanAuth } from "@/lib/fan-auth-rate-limit";
import { consumePasswordReset } from "@/lib/password-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? INVALID_RESET_LINK }, { status: 400 });
  const limited = await limitFanAuth(request, "reset-password", parsed.data.token);
  if (limited) return limited;
  try {
    if (!await consumePasswordReset(parsed.data.token, parsed.data.password)) {
      return NextResponse.json({ error: INVALID_RESET_LINK, code: "invalid_reset_link" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ message: "Your password has been updated. Sign in with your new password." }, {
      headers: { "Set-Cookie": buildClearFanSessionCookie(), "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "We couldn’t update your password. Please try again in a moment." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
