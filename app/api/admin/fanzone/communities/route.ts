import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import {
  CommunityInputError,
  getCommunityModerationDashboard,
  moderateCommunityItem,
  resolveCommunityReport,
  reviewCommunityAppeal,
  upsertCommunityContent,
} from "@/lib/fanzone-communities";
import { FANZONE_COMMUNITY_KEYS } from "@/lib/fanzone-community-config";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HttpUrl = z.string().trim().max(1000).url().refine(
  (value) => ["http:", "https:"].includes(new URL(value).protocol),
  "Only HTTP or HTTPS URLs are allowed.",
);

const ContentBody = z.object({
  id: z.string().uuid().optional(),
  communityKey: z.enum(FANZONE_COMMUNITY_KEYS),
  kind: z.enum(["official_update", "calendar", "showcase"]),
  title: z.string().trim().min(2).max(140),
  body: z.string().trim().max(1200).nullable().optional(),
  href: HttpUrl.nullable().optional(),
  imageUrl: HttpUrl.nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  published: z.boolean(),
}).strict();

const QuestionAction = z.object({
  targetType: z.literal("question"),
  targetId: z.string().uuid(),
  action: z.enum(["approve", "deny", "remove", "answer"]),
  note: z.string().trim().max(500).optional(),
  answer: z.string().trim().min(2).max(1200).optional(),
}).strict();

const IdeaAction = z.object({
  targetType: z.literal("idea"),
  targetId: z.string().uuid(),
  action: z.enum(["approve", "deny", "remove", "set_status"]),
  note: z.string().trim().max(500).optional(),
  status: z.enum(["under_review", "planned", "shipped", "declined"]).optional(),
}).strict();

const ReportAction = z.object({
  targetType: z.literal("report"),
  reportId: z.number().int().positive(),
  removeTarget: z.boolean().default(false),
}).strict();

const AppealAction = z.object({
  targetType: z.literal("appeal"),
  appealId: z.string().uuid(),
  decision: z.enum(["upheld", "denied"]),
  response: z.string().trim().min(2).max(1000),
}).strict();

const ActionBody = z.discriminatedUnion("targetType", [
  QuestionAction,
  IdeaAction,
  ReportAction,
  AppealAction,
]);

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getCommunityModerationDashboard(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = ContentBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid content" }, { status: 400 });
  try {
    const id = await upsertCommunityContent(auth.email, parsed.data);
    return NextResponse.json({ ok: true, id }, { status: parsed.data.id ? 200 : 201 });
  } catch (error) {
    if (error instanceof CommunityInputError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = ActionBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid moderation action" }, { status: 400 });
  try {
    let updated = false;
    if (parsed.data.targetType === "question" || parsed.data.targetType === "idea") {
      updated = await moderateCommunityItem(auth.email, parsed.data);
    } else if (parsed.data.targetType === "report") {
      updated = await resolveCommunityReport(auth.email, parsed.data.reportId, parsed.data.removeTarget);
    } else {
      updated = await reviewCommunityAppeal(
        auth.email,
        parsed.data.appealId,
        parsed.data.decision,
        parsed.data.response,
      );
    }
    return updated
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof CommunityInputError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
