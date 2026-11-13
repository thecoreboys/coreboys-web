import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { requestHasSameOrigin } from "@/lib/x/security";
import { listApplications, updateApplicationStatus } from "@/lib/contributors/store";
import { readApplicationJson, reviewStatusSchema, submissionKindSchema } from "@/lib/contributors/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const cursorSchema = z.object({ at: z.string().max(80).refine(value => Number.isFinite(Date.parse(value))), id: z.string().uuid() });
const filtersSchema = z.object({ kind: z.union([z.literal("all"), submissionKindSchema]), status: z.union([z.literal("all"), reviewStatusSchema]) });
const updateSchema = z.object({ id: z.string().uuid(), status: reviewStatusSchema }).strict();

function validOrigin(request: Request): boolean {
  if (requestHasSameOrigin(request)) return true;
  if (process.env.NODE_ENV !== "development" || request.headers.get("sec-fetch-site") !== "same-origin") return false;
  try {
    const origin = new URL(request.headers.get("origin") || ""), target = new URL(request.url);
    const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
    return loopback.has(origin.hostname) && loopback.has(target.hostname) && origin.protocol === target.protocol && origin.port === target.port;
  } catch { return false; }
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) { auth.response.headers.set("Cache-Control", "private, no-store"); return auth.response; }
  const params = new URL(request.url).searchParams;
  const cursor = params.has("at") || params.has("id") ? cursorSchema.safeParse({ at: params.get("at"), id: params.get("id") }) : null;
  const filters = filtersSchema.safeParse({ kind: params.get("kind") ?? "all", status: params.get("status") ?? "all" });
  if ((cursor && !cursor.success) || !filters.success) return NextResponse.json({ error: "Invalid inbox filter or page." }, { status: 400, headers });
  try { return NextResponse.json(await listApplications(cursor?.success ? cursor.data : null, filters.data), { headers }); }
  catch { return NextResponse.json({ error: "Submissions could not be loaded." }, { status: 503, headers }); }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) { auth.response.headers.set("Cache-Control", "private, no-store"); return auth.response; }
  if (!validOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return NextResponse.json({ error: "Use JSON." }, { status: 415, headers });
  let body: unknown;
  try { body = await readApplicationJson(request); }
  catch (error) { return NextResponse.json({ error: "Invalid update." }, { status: error instanceof Error && error.message === "body_too_large" ? 413 : 400, headers }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid update." }, { status: 400, headers });
  try {
    const updated = await updateApplicationStatus(parsed.data.id, parsed.data.status);
    return updated ? NextResponse.json({ ok: true }, { headers }) : NextResponse.json({ error: "Submission not found." }, { status: 404, headers });
  } catch { return NextResponse.json({ error: "The status could not be saved. Please try again." }, { status: 503, headers }); }
}
