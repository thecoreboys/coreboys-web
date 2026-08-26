import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { deletePoll, getPoll, setPollStatus, setPollWinner, updatePollSettings } from "@/lib/community";
import { FANZONE_COMMUNITY_KEYS } from "@/lib/fanzone-community-config";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MediaUrl = z.string().trim().max(2048).url().refine(
  (value) => ["http:", "https:"].includes(new URL(value).protocol),
  "Media URLs must use HTTP or HTTPS.",
);

/** Admin — poll results (live counts). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const poll = await getPoll(id, null, { revealResults: true });
  if (!poll) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ poll });
}

const PatchBody = z.object({
  status: z.enum(["open", "closed"]).optional(),
  description: z.string().trim().max(600).nullable().optional(),
  mediaUrl: MediaUrl.nullable().optional(),
  sourceSubmissionId: z.string().uuid().nullable().optional(),
  winnerOptionId: z.string().uuid().nullable().optional(),
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  resultsVisibility: z.enum(["always", "after_vote", "after_close"]).optional(),
  featured: z.boolean().optional(),
  communityKey: z.enum(FANZONE_COMMUNITY_KEYS).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "No changes supplied.");

/** Admin — open/close a poll. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!requestHasSameOrigin(req)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  if (body.opensAt && body.closesAt && new Date(body.opensAt) >= new Date(body.closesAt)) {
    return NextResponse.json({ error: "Opening time must be before closing time." }, { status: 400 });
  }
  const hasSettings =
    body.description !== undefined ||
    body.mediaUrl !== undefined ||
    body.sourceSubmissionId !== undefined ||
    body.opensAt !== undefined ||
    body.closesAt !== undefined ||
    body.resultsVisibility !== undefined ||
    body.featured !== undefined;
  const hasCommunityTarget = body.communityKey !== undefined;
  let ok = true;
  if (hasSettings || hasCommunityTarget) {
    ok = await updatePollSettings(id, {
      description: body.description,
      mediaUrl: body.mediaUrl,
      sourceSubmissionId: body.sourceSubmissionId,
      opensAt: body.opensAt,
      closesAt: body.closesAt,
      resultsVisibility: body.resultsVisibility,
      featured: body.featured,
      communityKey: body.communityKey,
    });
  }
  if (ok && body.winnerOptionId !== undefined) {
    ok = await setPollWinner(id, body.winnerOptionId);
  }
  if (ok && body.status) ok = await setPollStatus(id, body.status);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Admin — delete a poll (cascades options + votes). */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!requestHasSameOrigin(req)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const ok = await deletePoll(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
