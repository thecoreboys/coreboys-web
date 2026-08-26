import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { FaceStoreError } from "@/lib/face-recognition-store";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
} as const;

const PUBLIC_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function facePrivateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export function facePrivateResponse(response: NextResponse) {
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export function facePublicJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PUBLIC_HEADERS });
}

export function faceRequestId(request: Request): string {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && /^[A-Za-z0-9._:-]{1,200}$/.test(supplied)
    ? supplied
    : randomUUID();
}

export function faceStoreErrorResponse(error: unknown) {
  if (!(error instanceof FaceStoreError)) throw error;
  const status = error.code === "not_found"
    ? 404
    : error.code === "consent_required"
      ? 422
      : 409;
  return facePrivateJson({ error: error.message, code: error.code }, status);
}
