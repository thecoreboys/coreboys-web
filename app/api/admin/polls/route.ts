import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { createPoll, listPolls } from "@/lib/community";
import { FANZONE_COMMUNITY_KEYS } from "@/lib/fanzone-community-config";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MediaUrl = z.string().trim().max(2048).url().refine(
  (value) => ["http:", "https:"].includes(new URL(value).protocol),
  "Media URLs must use HTTP or HTTPS.",
);

/** Admin — list all polls with results (reuses the public assembler). */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const polls = await listPolls(null, { includeScheduled: true, revealResults: true });
  return NextResponse.json({ polls });
}

const CreateBody = z.object({
  question: z.string().min(3).max(280),
  kind: z.enum(["standard", "caption", "prediction", "ranked"]).optional(),
  description: z.string().trim().max(600).nullable().optional(),
  mediaUrl: MediaUrl.nullable().optional(),
  sourceSubmissionId: z.string().uuid().nullable().optional(),
  options: z.array(z.union([
    z.string().trim().min(1).max(120),
    z.object({
      label: z.string().trim().min(1).max(120),
      mediaUrl: MediaUrl.nullable().optional(),
    }),
  ])).min(2).max(8),
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  resultsVisibility: z.enum(["always", "after_vote", "after_close"]).optional(),
  featured: z.boolean().optional(),
  // Subscriber/member entitlement has no issuance path yet. Keep existing
  // rows safe-deny, but prevent creating an audience nobody can join.
  audience: z.enum(["everyone","signed_in","live_attendees"]).optional(),
  communityKey: z.enum(FANZONE_COMMUNITY_KEYS).nullable().optional(),
});

/** Admin — create + open a poll. created_by = admin email (JWT identity). */
export async function POST(req: Request) {
  if (!requestHasSameOrigin(req)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: z.infer<typeof CreateBody>;
  try {
    body = CreateBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const normalizedOptions = body.options.map((option) =>
    typeof option === "string" ? { label: option, mediaUrl: null } : option,
  );
  const uniqueOptions = new Set(normalizedOptions.map((option) => option.label.trim().toLocaleLowerCase()));
  if (uniqueOptions.size !== body.options.length) {
    return NextResponse.json({ error: "Poll options must be unique." }, { status: 400 });
  }
  if (body.closesAt && new Date(body.closesAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Closing time must be in the future." }, { status: 400 });
  }
  if (body.opensAt && body.closesAt && new Date(body.opensAt) >= new Date(body.closesAt)) {
    return NextResponse.json({ error: "Opening time must be before closing time." }, { status: 400 });
  }
  if (body.kind === "ranked" && normalizedOptions.length < 3) {
    return NextResponse.json({ error: "Ranked polls need at least three choices." }, { status: 400 });
  }

  const id = await createPoll({
    question: body.question,
    kind: body.kind ?? "standard",
    description: body.description ?? null,
    mediaUrl: body.mediaUrl ?? null,
    sourceSubmissionId: body.sourceSubmissionId ?? null,
    options: normalizedOptions.map((option) => ({
      label: option.label.trim(),
      mediaUrl: option.mediaUrl ?? null,
    })),
    opensAt: body.opensAt ?? null,
    closesAt: body.closesAt ?? null,
    resultsVisibility: body.resultsVisibility ?? "after_vote",
    featured: body.featured ?? false,
    audience: body.audience ?? "signed_in",
    communityKey: body.communityKey ?? null,
    createdBy: auth.email,
  });
  return NextResponse.json({ id }, { status: 201 });
}
