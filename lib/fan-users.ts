/**
 * Fan user data layer — zod validation + bcrypt hashing + raw-SQL CRUD
 * against the `fan_users` table (created in coreboys-db migration 0007).
 * Uses the shared parameterised `query()` from lib/db.ts.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "@/lib/db";

const BCRYPT_ROUNDS = 10;

export const signupSchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  displayName: z.string().trim().min(1, "Name is required").max(50),
  consent: z.literal(true, {
    errorMap: () => ({ message: "You must agree to continue" }),
  }),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** The shape returned to clients — never includes the password hash. */
export type FanUserPublic = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  createdAt: string;
};

type FanUserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  email_verified: boolean;
  created_at: Date;
};

export class DuplicateEmailError extends Error {
  constructor() {
    super("An account with that email already exists.");
    this.name = "DuplicateEmailError";
  }
}

function toPublic(row: FanUserRow): FanUserPublic {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    emailVerified: row.email_verified,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export async function createFanUser(input: SignupInput): Promise<FanUserPublic> {
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  try {
    const { rows } = await query<FanUserRow>(
      `INSERT INTO fan_users (id, email, password_hash, display_name, consent, consent_at)
       VALUES ($1, $2, $3, $4, true, now())
       RETURNING id, email, password_hash, display_name, email_verified, created_at`,
      [id, input.email, passwordHash, input.displayName],
    );
    return toPublic(rows[0]!);
  } catch (err: unknown) {
    // 23505 = unique_violation (email already taken)
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
      throw new DuplicateEmailError();
    }
    throw err;
  }
}

/** Full row incl. password hash — for login comparison only. */
export async function getFanUserByEmail(email: string): Promise<FanUserRow | null> {
  const { rows } = await query<FanUserRow>(
    `SELECT id, email, password_hash, display_name, email_verified, created_at
     FROM fan_users WHERE email = $1`,
    [email.trim().toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function getFanUserById(id: string): Promise<FanUserPublic | null> {
  const { rows } = await query<FanUserRow>(
    `SELECT id, email, password_hash, display_name, email_verified, created_at
     FROM fan_users WHERE id = $1`,
    [id],
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
