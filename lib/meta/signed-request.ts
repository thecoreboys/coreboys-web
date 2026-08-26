import { createHmac, timingSafeEqual } from "node:crypto";

export type MetaSignedRequest = {
  algorithm: "HMAC-SHA256";
  userId: string;
  issuedAt: number | null;
};

function decodeJsonSegment(segment: string): unknown {
  const decoded = Buffer.from(segment, "base64url").toString("utf8");
  return JSON.parse(decoded) as unknown;
}

/**
 * Verify and decode the `signed_request` Meta posts to its user-data
 * deletion callback. The signature covers the original base64url payload
 * segment, not the decoded JSON.
 */
export function verifyMetaSignedRequest(
  signedRequest: string,
  appSecret: string,
): MetaSignedRequest | null {
  const segments = signedRequest.split(".");
  if (segments.length !== 2) return null;

  const [encodedSignature, encodedPayload] = segments;
  if (!encodedSignature || !encodedPayload || !appSecret) return null;

  let suppliedSignature: Buffer;
  let payload: unknown;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
    payload = decodeJsonSegment(encodedPayload);
  } catch {
    return null;
  }

  const expectedSignature = createHmac("sha256", appSecret)
    .update(encodedPayload, "utf8")
    .digest();
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Record<string, unknown>;
  if (candidate.algorithm !== "HMAC-SHA256") return null;

  const rawUserId = candidate.user_id;
  if (typeof rawUserId !== "string" && typeof rawUserId !== "number") {
    return null;
  }
  const userId = String(rawUserId).trim();
  if (!userId || userId.length > 200) return null;

  const issuedAt =
    typeof candidate.issued_at === "number" && Number.isFinite(candidate.issued_at)
      ? candidate.issued_at
      : null;

  return { algorithm: "HMAC-SHA256", userId, issuedAt };
}
