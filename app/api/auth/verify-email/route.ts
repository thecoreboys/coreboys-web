import { NextResponse } from "next/server";
import { consumeEmailVerification, publicOrigin } from "@/lib/email-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const verified = await consumeEmailVerification(url.searchParams.get("token") ?? "").catch((error) => {
    console.error("email verification failed", error);
    return false;
  });
  const destination = new URL("/account/settings", publicOrigin());
  destination.searchParams.set("email", verified ? "verified" : "invalid");
  return NextResponse.redirect(destination, { status: 303 });
}
