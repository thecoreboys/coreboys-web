import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { query, withTransaction } from "@/lib/db";

const ISSUER = "CORE Staff";
const STEP_SECONDS = 30;
const DIGITS = 6;
const CHALLENGE_TTL_SECONDS = 10 * 60;
const MAX_CHALLENGE_ATTEMPTS = 5;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

type ChallengePurpose = "enroll" | "verify";

type AdminTotpRow = {
  id: string;
  email: string;
  role: string;
  session_version: number;
  totp_enabled: boolean;
  totp_secret_ciphertext: string | null;
  totp_last_used_step: string | null;
};

type ChallengeRow = {
  id: string;
  admin_user_id: string;
  purpose: ChallengePurpose;
  secret_ciphertext: string | null;
  attempt_count: number;
  expires_at: string;
  consumed_at: string | null;
};

export class TotpConfigurationError extends Error {
  constructor() {
    super("TOTP encryption is not configured.");
    this.name = "TotpConfigurationError";
  }
}

export class TotpChallengeError extends Error {
  constructor(public readonly code: "expired" | "invalid" | "locked") {
    super(code);
    this.name = "TotpChallengeError";
  }
}

function encryptionKey(): Buffer {
  const raw = process.env.ADMIN_TOTP_ENCRYPTION_KEY;
  if (!raw) throw new TotpConfigurationError();
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new TotpConfigurationError();
  return key;
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decrypt(value: string): string {
  const [version, ivRaw, tagRaw, ciphertextRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !ciphertextRaw) throw new TotpConfigurationError();
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
}

function base32Encode(input: Buffer): string {
  let buffer = 0;
  let bits = 0;
  let output = "";
  for (const byte of input) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(buffer << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const value = input.replace(/[\s=-]/g, "").toUpperCase();
  if (!/^[A-Z2-7]{16,}$/.test(value)) throw new TotpConfigurationError();
  let buffer = 0;
  let bits = 0;
  const output: number[] = [];
  for (const char of value) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new TotpConfigurationError();
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const value = ((digest[offset]! & 0x7f) << 24)
    | (digest[offset + 1]! << 16)
    | (digest[offset + 2]! << 8)
    | digest[offset + 3]!;
  return String(value % 10 ** DIGITS).padStart(DIGITS, "0");
}

function currentStep(): number {
  return Math.floor(Date.now() / 1_000 / STEP_SECONDS);
}

function codeMatches(secret: string, code: string): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const supplied = Buffer.from(code);
  const step = currentStep();
  for (const candidate of [step - 1, step, step + 1]) {
    const expected = Buffer.from(totpCode(secret, candidate));
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) return candidate;
  }
  return null;
}

export function createTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function buildTotpUri(email: string, secret: string): string {
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

export async function createTotpChallenge(
  adminUserId: string,
  purpose: ChallengePurpose,
): Promise<{ id: string }> {
  const id = randomUUID();
  const secretCiphertext = purpose === "enroll" ? encrypt(createTotpSecret()) : null;
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE admin_totp_challenges
          SET consumed_at = now()
        WHERE admin_user_id = $1
          AND consumed_at IS NULL`,
      [adminUserId],
    );
    await client.query(
      `INSERT INTO admin_totp_challenges
        (id, admin_user_id, purpose, secret_ciphertext, expires_at)
       VALUES ($1, $2, $3, $4, now() + ($5::int * interval '1 second'))`,
      [id, adminUserId, purpose, secretCiphertext, CHALLENGE_TTL_SECONDS],
    );
  });
  return { id };
}

export async function getEnrollmentSecret(challengeId: string, email: string): Promise<string> {
  const result = await query<ChallengeRow & { email: string }>(
    `SELECT c.id::text, c.admin_user_id::text, c.purpose, c.secret_ciphertext,
            c.attempt_count, c.expires_at::text, c.consumed_at::text, u.email
       FROM admin_totp_challenges c
       JOIN admin_users u ON u.id = c.admin_user_id
      WHERE c.id = $1 AND lower(u.email) = lower($2)`,
    [challengeId, email],
  );
  const challenge = result.rows[0];
  if (!challenge || challenge.purpose !== "enroll" || challenge.consumed_at || Date.parse(challenge.expires_at) <= Date.now()) {
    throw new TotpChallengeError("expired");
  }
  if (!challenge.secret_ciphertext) throw new TotpChallengeError("invalid");
  return decrypt(challenge.secret_ciphertext);
}

export async function completeTotpChallenge(challengeId: string, email: string, code: string): Promise<{
  email: string;
  sessionVersion: number;
}> {
  return withTransaction(async (client) => {
    const challengeResult = await client.query<ChallengeRow>(
      `SELECT id::text, admin_user_id::text, purpose, secret_ciphertext,
              attempt_count, expires_at::text, consumed_at::text
         FROM admin_totp_challenges
        WHERE id = $1
        FOR UPDATE`,
      [challengeId],
    );
    const challenge = challengeResult.rows[0];
    if (!challenge || challenge.consumed_at || Date.parse(challenge.expires_at) <= Date.now()) {
      throw new TotpChallengeError("expired");
    }
    if (challenge.attempt_count >= MAX_CHALLENGE_ATTEMPTS) throw new TotpChallengeError("locked");

    const userResult = await client.query<AdminTotpRow>(
      `SELECT id::text, email, role, session_version, totp_enabled,
              totp_secret_ciphertext, totp_last_used_step::text
         FROM admin_users
        WHERE id = $1 AND lower(email) = lower($2) AND deleted_at IS NULL
        FOR UPDATE`,
      [challenge.admin_user_id, email],
    );
    const user = userResult.rows[0];
    if (!user || user.role !== "admin") throw new TotpChallengeError("invalid");
    const encryptedSecret = challenge.purpose === "enroll"
      ? challenge.secret_ciphertext
      : user.totp_secret_ciphertext;
    if (!encryptedSecret) throw new TotpChallengeError("invalid");
    const step = codeMatches(decrypt(encryptedSecret), code);
    if (step === null || (challenge.purpose === "verify" && Number(user.totp_last_used_step ?? -1) >= step)) {
      await client.query(
        `UPDATE admin_totp_challenges
            SET attempt_count = attempt_count + 1
          WHERE id = $1`,
        [challenge.id],
      );
      throw new TotpChallengeError("invalid");
    }

    const update = await client.query<{ email: string; session_version: number }>(
      `UPDATE admin_users
          SET totp_enabled = true,
              totp_secret_ciphertext = COALESCE(totp_secret_ciphertext, $2),
              totp_enrolled_at = COALESCE(totp_enrolled_at, now()),
              totp_last_used_step = CASE WHEN $3::boolean THEN totp_last_used_step ELSE $4 END,
              session_version = session_version + CASE WHEN $3::boolean THEN 0 ELSE 1 END,
              updated_at = now()
        WHERE id = $1
      RETURNING email, session_version`,
      [user.id, challenge.purpose === "enroll" ? encryptedSecret : null, challenge.purpose === "enroll", step],
    );
    await client.query(`UPDATE admin_totp_challenges SET consumed_at = now() WHERE id = $1`, [challenge.id]);
    const row = update.rows[0];
    if (!row) throw new TotpChallengeError("invalid");
    return { email: row.email, sessionVersion: row.session_version };
  });
}

export async function resetAdminTotp(adminUserId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE admin_users
          SET totp_enabled = false,
              totp_secret_ciphertext = NULL,
              totp_enrolled_at = NULL,
              totp_last_used_step = NULL,
              session_version = session_version + 1,
              updated_at = now()
        WHERE id = $1`,
      [adminUserId],
    );
    await client.query(
      `UPDATE admin_totp_challenges
          SET consumed_at = now()
        WHERE admin_user_id = $1 AND consumed_at IS NULL`,
      [adminUserId],
    );
  });
}
