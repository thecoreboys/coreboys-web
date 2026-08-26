import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-api";
import { MEMBER_SLUGS } from "@/lib/staff-accounts";
import {
  decidePostcardStaffAction,
  type PostcardStaffAction,
} from "@/lib/postcard-permissions";
import {
  applyPostcardStudioAction,
  loadPostcardStudioDashboard,
  PostcardStudioStoreError,
} from "@/lib/postcard-studio-store";
import {
  PostcardStudioActionSchema,
  type PostcardStudioAction,
} from "@/lib/postcard-studio-schema";
import { requestHasSameOrigin } from "@/lib/x/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function requestedMember(request: Request): string | null {
  return new URL(request.url).searchParams.get("member");
}

function permissionFor(action: PostcardStudioAction["action"]): PostcardStaffAction {
  switch (action) {
    case "create_pack": return "pack.create";
    case "update_pack":
    case "save_revision": return "pack.update";
    case "retire_pack": return "pack.retire";
    case "submit_revision": return "pack.submit";
    case "review_revision": return "pack.review";
    case "publish_revision": return "pack.publish";
    case "schedule_drop": return "drop.schedule";
    case "cancel_drop": return "drop.cancel";
    case "acknowledge": return "acknowledgement.write";
    default: {
      const exhaustive: never = action;
      throw new Error(`Unsupported postcard action: ${String(exhaustive)}`);
    }
  }
}

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  const decision = decidePostcardStaffAction(
    auth,
    "pack.read",
    requestedMember(request),
    MEMBER_SLUGS,
  );
  if (!decision.allowed || !decision.memberSlug) {
    return response({ error: "member scope required" }, 403);
  }
  for (const action of ["inbox.read", "analytics.read"] as const) {
    const additional = decidePostcardStaffAction(
      auth,
      action,
      decision.memberSlug,
      MEMBER_SLUGS,
    );
    if (!additional.allowed || additional.memberSlug !== decision.memberSlug) {
      return response({ error: "forbidden" }, 403);
    }
  }

  try {
    return response({
      dashboard: await loadPostcardStudioDashboard(decision.memberSlug),
    });
  } catch (error) {
    console.error("[postcard-studio] dashboard load failed", error);
    return response({ error: "Postcard Studio is unavailable. Confirm the postcard product migration is applied." }, 503);
  }
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return response({ error: "invalid origin" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return response({ error: "application/json required" }, 415);
  }
  const declaredBytes = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredBytes) && declaredBytes > 400_000) {
    return response({ error: "payload too large" }, 413);
  }
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const parsed = PostcardStudioActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return response({ error: parsed.error.issues[0]?.message ?? "invalid payload" }, 400);
  }
  const decision = decidePostcardStaffAction(
    auth,
    permissionFor(parsed.data.action),
    requestedMember(request),
    MEMBER_SLUGS,
  );
  if (!decision.allowed || !decision.memberSlug) {
    return response({ error: "forbidden" }, 403);
  }

  try {
    await applyPostcardStudioAction(decision.memberSlug, auth, parsed.data);
    return response({
      ok: true,
      dashboard: await loadPostcardStudioDashboard(decision.memberSlug),
    });
  } catch (error) {
    if (error instanceof PostcardStudioStoreError) {
      return response(
        { error: error.message },
        error.code === "not_found" ? 404 : 409,
      );
    }
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "23505") return response({ error: "That pack or drop code is already in use." }, 409);
      if (error.code === "23503") return response({ error: "A referenced pack, revision, or album no longer exists." }, 409);
    }
    console.error("[postcard-studio] mutation failed", error);
    return response({ error: "Unable to update Postcard Studio." }, 500);
  }
}
