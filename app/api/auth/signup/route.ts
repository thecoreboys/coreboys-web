import { after, NextResponse } from "next/server";
import { signupSchema, createFanUser, DuplicateEmailError } from "@/lib/fan-users";
import { signFanSessionToken, buildFanSessionCookie } from "@/lib/fan-auth";
import { getEmailVerificationReadiness, requestEmailVerification } from "@/lib/email-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    const user = await createFanUser(parsed.data);
    const token = await signFanSessionToken(user.id);
    const res = NextResponse.json({ user }, { status: 201 });
    res.headers.set("Set-Cookie", buildFanSessionCookie(token));
    if (getEmailVerificationReadiness().ready) {
      after(async () => {
        await requestEmailVerification(user.id).catch((error) => {
          console.error("signup email verification send failed", error);
        });
      });
    }
    return res;
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[auth/signup]", err);
    const msg = err instanceof Error ? err.message : "";
    const down = /ENOTFOUND|ECONNREFUSED|connect|DATABASE/i.test(msg);
    return NextResponse.json(
      { error: down ? "Accounts are temporarily unavailable. Try again in a moment." : "Something went wrong" },
      { status: 503 },
    );
  }
}
