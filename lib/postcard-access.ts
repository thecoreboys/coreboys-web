import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const POSTCARD_ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPostcardOrderId(value: string): boolean {
  return POSTCARD_ORDER_ID.test(value);
}

export function createPostcardStatusToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPostcardStatusToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyPostcardStatusToken(token: string, expectedHash: string): boolean {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token) || !/^[0-9a-f]{64}$/i.test(expectedHash)) {
    return false;
  }
  const supplied = Buffer.from(hashPostcardStatusToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
