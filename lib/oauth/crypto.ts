/**
 * AES-256-GCM token vault. Ciphertext is stored as
 * `v1:<iv_b64>:<tag_b64>:<cipher_b64>`. Never log the plaintext.
 *
 * Key: `FAN_OAUTH_KEY` (32+ chars) or a SHA-256 of `FAN_SESSION_SECRET`.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

function keyBytes(): Buffer {
  const explicit = process.env.FAN_OAUTH_KEY;
  if (explicit && explicit.length >= 32) {
    return createHash("sha256").update(explicit).digest();
  }
  const fallback = process.env.FAN_SESSION_SECRET;
  if (!fallback || fallback.length < 24) {
    throw new Error(
      "FAN_OAUTH_KEY (>=32 chars) or FAN_SESSION_SECRET (>=24 chars) is required to store OAuth tokens.",
    );
  }
  return createHash("sha256").update(fallback).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(":");
}

export function decryptSecret(packed: string): string {
  const [ver, ivB64, tagB64, dataB64] = packed.split(":");
  if (ver !== PREFIX || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("malformed ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
