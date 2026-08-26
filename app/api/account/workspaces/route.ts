import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import {
  deleteWorkspacePreference,
  listWorkspacePreferences,
  upsertWorkspacePreference,
} from "@/lib/workspace-preferences";
import type { FeatureId } from "@/lib/subscriptions/catalog";
import {
  EntitlementDeniedError,
  requireAccountEntitlement,
} from "@/lib/subscriptions/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Kind = z.string().min(1).max(32).regex(/^[a-z0-9_-]+$/);
const Name = z.string().trim().min(1).max(80);
const PutBody = z.object({
  kind: Kind,
  name: Name,
  payload: z.unknown(),
});

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

function featureForWorkspace(kind: string): FeatureId | null {
  if (kind === "watch") return "multiview.saved_layouts";
  if (kind === "watch-queue") return "queue.templates";
  return null;
}

function entitlementDenied(error: unknown) {
  if (!(error instanceof EntitlementDeniedError)) throw error;
  return privateJson(
    {
      error: error.code,
      featureId: error.featureId,
      requiredPlanId: error.requiredPlanId,
      upgradeHref: `/upgrade?feature=${encodeURIComponent(error.featureId)}`,
    },
    { status: 403 },
  );
}

async function requireWorkspaceEntitlement(input: {
  userId: string;
  request: Request;
  kind: string;
}) {
  const featureId = featureForWorkspace(input.kind);
  if (!featureId) return null;
  return requireAccountEntitlement({
    userId: input.userId,
    requestHostname: new URL(input.request.url).hostname,
    featureId,
  });
}

export async function GET(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized", items: [] }, { status: 401 });
  const parsed = Kind.safeParse(new URL(request.url).searchParams.get("kind"));
  if (!parsed.success) return privateJson({ error: "invalid_kind", items: [] }, { status: 400 });
  try {
    await requireWorkspaceEntitlement({ userId, request, kind: parsed.data });
  } catch (error) {
    return entitlementDenied(error);
  }
  const rows = await listWorkspacePreferences(userId, parsed.data);
  return privateJson({
    items: rows.map((row) => ({
      kind: row.kind,
      name: row.name,
      payload: row.payload,
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
  });
}

export async function PUT(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const parsed = PutBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid" }, { status: 400 });
  try {
    await requireWorkspaceEntitlement({ userId, request, kind: parsed.data.kind });
  } catch (error) {
    return entitlementDenied(error);
  }
  const serialized = JSON.stringify(parsed.data.payload);
  if (typeof serialized !== "string") return privateJson({ error: "invalid_payload" }, { status: 400 });
  if (serialized.length > 100_000) return privateJson({ error: "payload_too_large" }, { status: 413 });
  await upsertWorkspacePreference(userId, parsed.data.kind, parsed.data.name, parsed.data.payload);
  return privateJson({
    ok: true,
    item: {
      kind: parsed.data.kind,
      name: parsed.data.name,
      payload: parsed.data.payload,
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function DELETE(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const parsed = z.object({ kind: Kind, name: Name }).safeParse({
    kind: params.get("kind"),
    name: params.get("name"),
  });
  if (!parsed.success) return privateJson({ error: "invalid" }, { status: 400 });
  try {
    await requireWorkspaceEntitlement({ userId, request, kind: parsed.data.kind });
  } catch (error) {
    return entitlementDenied(error);
  }
  await deleteWorkspacePreference(userId, parsed.data.kind, parsed.data.name);
  return privateJson({ ok: true });
}
