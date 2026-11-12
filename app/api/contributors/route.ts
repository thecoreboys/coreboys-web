import { NextResponse } from "next/server";
import { requestHasSameOrigin } from "@/lib/x/security";
import { consumeSiteAccessRateLimit } from "@/lib/site-access-rate-limit";
import { applicationEnvelope, readApplicationJson } from "@/lib/contributors/validation";
import { contributorFingerprint, issueApplicationToken, verifyApplicationToken } from "@/lib/contributors/security";
import { saveApplication } from "@/lib/contributors/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200, extra = {}) => NextResponse.json(body, { status, headers: { ...headers, ...extra } });
function validOrigin(request: Request): boolean {
  if (requestHasSameOrigin(request)) return true;
  // Next's local server canonicalizes 127.0.0.1 to localhost internally.
  // This alias exception is limited to development, one port, and same-origin browser requests.
  if (process.env.NODE_ENV !== "development" || request.headers.get("sec-fetch-site") !== "same-origin") return false;
  try {
    const origin = new URL(request.headers.get("origin") || ""), target = new URL(request.url);
    const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
    return loopback.has(origin.hostname) && loopback.has(target.hostname) && origin.protocol === target.protocol && origin.port === target.port;
  } catch { return false; }
}
export async function GET(request: Request) {
  try { return json({ token: await issueApplicationToken(contributorFingerprint(request)) }); }
  catch { return json({ error: "Applications are temporarily unavailable. Please try again later." }, 503); }
}
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: "Invalid origin." }, 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return json({ error: "Use JSON." }, 415);
  try {
    const fingerprint = contributorFingerprint(request);
    const limit = await consumeSiteAccessRateLimit(`contributors:${fingerprint}`, 10);
    if (!limit.ok) return json({ error: "Too many attempts. Please try again later." }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
    let body: unknown;
    try { body = await readApplicationJson(request); } catch (error) { return json({ error: "The form is invalid or too large." }, error instanceof Error && error.message === "body_too_large" ? 413 : 400); }
    const parsed = applicationEnvelope.safeParse(body);
    if (!parsed.success) return json({ error: "Check your details, add a Twitter or Discord handle, and confirm you are 13 or older." }, 400);
    if (parsed.data.website) return json({ error: "We could not verify the form. Please reopen it and try again." }, 400);
    const tokenId = await verifyApplicationToken(parsed.data.token, fingerprint);
    if (!tokenId) return json({ error: "Your form expired or could not be verified. Reopen it and try again." }, 400);
    const result = await saveApplication(parsed.data.details, fingerprint, tokenId);
    if (result === "limited") return json({ error: "You have reached today’s application limit. Please try tomorrow." }, 429, { "Retry-After": "86400" });
    return json({ ok: true }, result === "saved" ? 201 : 200);
  } catch { return json({ error: "We couldn’t save your application. Your details are still here. Please try again later." }, 503); }
}
