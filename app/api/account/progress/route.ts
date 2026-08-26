import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { recordPassportWatchProgress } from "@/lib/passport/watch";
import { listProgress, mergeProgress, upsertProgress } from "@/lib/watch/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function progressResponse(items: Awaited<ReturnType<typeof listProgress>>) {
  const response = NextResponse.json({ items });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET() {
  const uid = await getCurrentFanUserId();
  if (!uid) return progressResponse([]);
  const items = await listProgress(uid);
  return progressResponse(items);
}

const Body = z.object({
  ref: z.string().min(1).max(200),
  kind: z.string().min(1).max(40).default("youtube"),
  platform: z.string().min(2).max(40).optional(),
  subject: z.string().max(64).nullable().optional(),
  event: z.enum(["hover", "tick", "complete", "mark_watched"]),
  seconds: z.number().int().min(0).max(180).optional(),
  progress: z.number().min(0).max(1).optional(),
  positionSeconds: z.number().min(0).max(60 * 60 * 24).optional(),
  durationSeconds: z.number().min(0).max(60 * 60 * 24).optional(),
  observedAt: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const uid = await getCurrentFanUserId();
  if (!uid) return new Response(null, { status: 204 });
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await upsertProgress({
    userId: uid,
    ref: body.ref,
    kind: body.kind,
    subject: body.subject,
    event: body.event,
    seconds: body.seconds,
    progress: body.progress,
    positionSeconds: body.positionSeconds,
    durationSeconds: body.durationSeconds,
    observedAt: body.observedAt,
  });
  // Manual completion is presentation state only. It never enters Passport,
  // verified presence, rewards, or account watch-time metrics.
  if (body.event === "tick" || body.event === "complete") {
    try {
      await recordPassportWatchProgress({
        userId: uid,
        playbackRef: body.ref,
        kind: body.kind,
        platform: body.platform ?? "",
        positionSeconds: body.positionSeconds ?? 0,
        complete: body.event === "complete",
      });
    } catch {
      // Playback history remains the primary write. Passport only projects
      // server-timed, catalog-backed credit and can retry on a later tick.
    }
  }
  return NextResponse.json({ ok: true });
}

const MergeItem = z.object({
  ref: z.string().min(1).max(200),
  kind: z.string().min(1).max(40).optional(),
  subject: z.string().max(64).nullable().optional(),
  hoverCount: z.number().int().min(0).max(1_000_000).optional(),
  seconds: z.number().int().min(0).max(60 * 60 * 24 * 365).optional(),
  progress: z.number().min(0).max(1).optional(),
  positionSeconds: z.number().min(0).max(60 * 60 * 24).optional(),
  durationSeconds: z.number().min(0).max(60 * 60 * 24).optional(),
  positionUpdatedAt: z.string().datetime().nullable().optional(),
  completed: z.boolean().optional(),
  completionSource: z.enum(["playback", "manual", "provider"]).nullable().optional(),
  updatedAt: z.string().datetime().optional(),
});

const MergeBody = z.object({
  sourceId: z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/).optional(),
  items: z.array(MergeItem).max(300),
});

/** Merge anonymous progress into the signed-in account, idempotently. */
export async function PUT(req: Request) {
  const uid = await getCurrentFanUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = MergeBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await mergeProgress(uid, parsed.data.items, parsed.data.sourceId ?? "legacy-v1");
  return progressResponse(await listProgress(uid));
}
