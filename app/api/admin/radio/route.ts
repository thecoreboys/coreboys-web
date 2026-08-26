import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import {
  archiveRadioCueAsset,
  createRadioCueAsset,
  createRadioCuePool,
  getRadioCueSnapshot,
  updateRadioCueAsset,
  updateRadioCuePool,
} from "@/lib/radio/catalog";
import { RADIO_NETWORK_SLUGS } from "@/lib/radio/public-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CueKind = z.enum(["tune_in", "live_takeover", "intermission", "outro"]);
const CueStatus = z.enum(["draft", "approved", "archived"]);
const CueSource = z.enum(["legacy", "recorded", "uploaded"]);
const Rotation = z.enum(["shuffle", "ordered"]);
const Network = z.enum(RADIO_NETWORK_SLUGS);

const Pool = z.object({
  id: z.string().uuid().optional(),
  key: z.string().trim().max(100),
  kind: CueKind,
  networkSlug: Network.nullable(),
  title: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
  rotationMode: Rotation.default("shuffle"),
});

const Asset = z.object({
  id: z.string().uuid().optional(),
  poolKey: z.string().trim().max(100),
  slug: z.string().trim().max(100),
  title: z.string().trim().min(1).max(160),
  audioUrl: z.string().trim().max(1500).nullable(),
  transcript: z.string().trim().max(4000).nullable().optional(),
  spokenTemplate: z.string().trim().max(2000).nullable().optional(),
  source: CueSource.default("recorded"),
  sourceLabel: z.string().trim().max(160).nullable().optional(),
  durationMs: z.coerce.number().int().min(250).max(180000).nullable().optional(),
  status: CueStatus.default("draft"),
  enabled: z.boolean().default(true),
  fallback: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(100),
});

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: "invalid_radio_payload", issues: error.issues }, { status: 400 });
  const message = error instanceof Error ? error.message : "radio_request_failed";
  const status = /duplicate|unique/i.test(message) ? 409 : /invalid_|not_found/.test(message) ? 400 : 500;
  return NextResponse.json({ error: status === 500 ? "radio_request_failed" : message }, { status });
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await getRadioCueSnapshot(true), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json() as { action?: string };
    if (body.action === "create-pool") {
      await createRadioCuePool(Pool.parse(body));
    } else if (body.action === "create-asset") {
      await createRadioCueAsset({ ...Asset.parse(body), createdBy: auth.id });
    } else {
      return NextResponse.json({ error: "unknown_radio_action" }, { status: 400 });
    }
    return NextResponse.json(await getRadioCueSnapshot(true), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json() as { action?: string };
    if (body.action === "update-pool") {
      const input = Pool.extend({ id: z.string().uuid() }).parse(body);
      await updateRadioCuePool(input);
    } else if (body.action === "update-asset") {
      const input = Asset.extend({ id: z.string().uuid() }).parse(body);
      await updateRadioCueAsset(input, auth.id);
    } else {
      return NextResponse.json({ error: "unknown_radio_action" }, { status: 400 });
    }
    return NextResponse.json(await getRadioCueSnapshot(true));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const body = z.object({ id: z.string().uuid() }).parse(await request.json());
    await archiveRadioCueAsset(body.id);
    return NextResponse.json(await getRadioCueSnapshot(true));
  } catch (error) {
    return errorResponse(error);
  }
}
