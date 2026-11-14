import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { siteAccessClientIp } from "@/lib/site-access-rate-limit";

function key(purpose: string): Buffer {
  const secret = process.env.CONTRIBUTOR_SECRET || process.env.FAN_SESSION_SECRET;
  if (!secret || secret.length < 24) throw new Error("contributor_secret_unavailable");
  return createHmac("sha256", secret).update(`core-contributors:v1:${purpose}`).digest();
}
export function contributorFingerprint(request: Request): string {
  return createHmac("sha256", key("ip")).update(siteAccessClientIp(request.headers)).digest("hex");
}
export async function issueApplicationToken(fingerprint: string): Promise<string> {
  return new SignJWT({ purpose: "contributor-application", fp: fingerprint }).setProtectedHeader({ alg: "HS256" }).setJti(randomUUID()).setIssuedAt().setExpirationTime("30m").sign(key("form"));
}
export async function verifyApplicationToken(token: string, fingerprint: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key("form"), { algorithms: ["HS256"] });
    if (payload.purpose !== "contributor-application" || payload.fp !== fingerprint || typeof payload.iat !== "number" || Date.now() / 1000 - payload.iat < 2 || typeof payload.jti !== "string" || !/^[a-f0-9-]{36}$/.test(payload.jti)) return null;
    return payload.jti;
  } catch { return null; }
}
export function encryptApplication(value: unknown): string {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key("storage"), iv);
  cipher.setAAD(Buffer.from("core-contributor:v1"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function decryptApplication(value: string): unknown {
  const [version, iv, tag, ciphertext] = value.split("."); if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("invalid_ciphertext");
  const cipher = createDecipheriv("aes-256-gcm", key("storage"), Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from("core-contributor:v1")); cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(ciphertext, "base64url")), cipher.final()]).toString("utf8"));
}
