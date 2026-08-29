import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import {
  createRadioJokeContext,
  deleteRadioJokeContext,
  generateRadioJokeDrafts,
  getRadioJokeBook,
  updateRadioJokeContext,
  updateRadioJokeDraft,
} from "@/lib/radio/joke-book";
import { RADIO_NETWORK_SLUGS } from "@/lib/radio/public-catalog";

const Network = z.enum(RADIO_NETWORK_SLUGS);
const Context = z.object({ networkSlug: Network, subjectLabel: z.string().trim().min(1).max(80), premise: z.string().trim().min(1).max(900), enabled: z.boolean().default(true) });
const CreateContext = Context.extend({ action: z.literal("create-context") });
const UpdateContext = Context.extend({ action: z.literal("update-context"), id: z.string().uuid() });
const DeleteContext = z.object({ action: z.literal("delete-context"), id: z.string().uuid() });
const Generate = z.object({ action: z.literal("generate"), networkSlug: Network });
const UpdateDraft = z.object({ action: z.literal("update-draft"), id: z.string().uuid(), status: z.enum(["draft", "approved", "archived"]) });
const Body = z.discriminatedUnion("action", [CreateContext, UpdateContext, DeleteContext, Generate, UpdateDraft]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_joke_book_payload" }, { status: 400 });
  const message = error instanceof Error ? error.message : "joke_book_request_failed";
  const status = /invalid_|not_found|no_enabled/.test(message) ? 400 : /ai_(disabled|daily_limit|subject_limit|monthly_budget|unavailable|not_configured)/.test(message) ? 429 : 503;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try { return NextResponse.json(await getRadioJokeBook(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure(parsed.error);
  try {
    const body = parsed.data;
    if (body.action === "create-context") await createRadioJokeContext({ ...body, actorId: auth.id });
    else if (body.action === "update-context") await updateRadioJokeContext({ ...body, actorId: auth.id });
    else if (body.action === "delete-context") await deleteRadioJokeContext(body.id);
    else if (body.action === "update-draft") await updateRadioJokeDraft({ ...body, actorId: auth.id });
    else if (body.action === "generate") await generateRadioJokeDrafts({ actorId: auth.id, networkSlug: body.networkSlug });
    return NextResponse.json(await getRadioJokeBook());
  } catch (error) { return failure(error); }
}
