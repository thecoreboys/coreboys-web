import { after, NextResponse } from "next/server";
import { forgotPasswordSchema, PASSWORD_RESET_REQUESTED } from "@/lib/auth/password-reset";
import { limitFanAuth } from "@/lib/fan-auth-rate-limit";
import { getResendReadiness } from "@/lib/notifications/resend";
import { requestPasswordReset } from "@/lib/password-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = forgotPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid email address." }, { status: 400 });
  const limited = await limitFanAuth(request, "forgot-password", parsed.data.email);
  if (limited) return limited;
  if (!getResendReadiness().readyToSend) {
    return NextResponse.json({ error: "Password reset emails are temporarily unavailable. Please try again later." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  // Lookup and delivery run after the response so account existence does not
  // change the response body, status, or time spent waiting for an email API.
  after(async () => {
    await requestPasswordReset(parsed.data.email, parsed.data.next).catch(() => {
      // Never log raw tokens, addresses, or provider request bodies.
      console.error("[auth/forgot-password] Password reset email could not be delivered.");
    });
  });
  return NextResponse.json({ message: PASSWORD_RESET_REQUESTED }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
