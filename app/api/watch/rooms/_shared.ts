import { NextResponse } from "next/server";
import { z } from "zod";
import { EntitlementDeniedError } from "@/lib/subscriptions/entitlements";
import { WatchRoomStoreError } from "@/lib/watch-together/store";

export const PeerId = z.string().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/);
export const RoomId = z.string().uuid();
export const RoomTitle = z.string().trim().min(1).max(80);

/** Reject cross-site cookie-authenticated mutations before reading their body. */
export function requestHasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";

  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }

  const allowed = new Set([requestOrigin]);
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      allowed.add(new URL(configured).origin);
    } catch {
      // A malformed configured origin must never broaden the allowlist.
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  return allowed.has(origin) && (!fetchSite || fetchSite === "same-origin" || fetchSite === "same-site");
}

export function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export function watchRoomError(error: unknown): NextResponse | null {
  if (error instanceof EntitlementDeniedError) {
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
  if (error instanceof WatchRoomStoreError) {
    return privateJson({ error: error.code }, { status: error.status });
  }
  return null;
}

export function requestHostname(request: Request): string {
  return new URL(request.url).hostname;
}

export function jsonSize(value: unknown): number {
  const serialized = JSON.stringify(value);
  return typeof serialized === "string" ? Buffer.byteLength(serialized, "utf8") : Number.POSITIVE_INFINITY;
}
