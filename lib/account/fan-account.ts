import "server-only";

import bcrypt from "bcryptjs";
import { query, withTransaction } from "@/lib/db";

const BCRYPT_ROUNDS = 10;

export type FanAccountProfile = {
  accountId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  publicHandle: string | null;
  publicCard: boolean;
  favoriteMember: string | null;
  createdAt: string;
};

type ProfileRow = {
  id: string;
  email: string;
  email_verified: boolean;
  display_name: string;
  public_slug: string | null;
  public_card: boolean;
  favorite_member: string | null;
  created_at: Date | string;
};

export class AccountProfileError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409, readonly field?: "displayName" | "publicHandle") {
    super(message);
    this.name = "AccountProfileError";
  }
}

export class AccountPasswordError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409, readonly field?: "currentPassword" | "newPassword") {
    super(message);
    this.name = "AccountPasswordError";
  }
}

function toProfile(row: ProfileRow): FanAccountProfile {
  return {
    accountId: row.id,
    email: row.email,
    emailVerified: row.email_verified,
    displayName: row.display_name,
    publicHandle: row.public_slug,
    publicCard: row.public_card,
    favoriteMember: row.favorite_member,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

const PROFILE_COLUMNS = `id, email, email_verified, display_name, public_slug, public_card, favorite_member, created_at`;

export async function getFanAccountProfile(userId: string): Promise<FanAccountProfile | null> {
  const { rows } = await query<ProfileRow>(`SELECT ${PROFILE_COLUMNS} FROM fan_users WHERE id = $1`, [userId]);
  return rows[0] ? toProfile(rows[0]) : null;
}

/**
 * Update the display name and/or public handle. `undefined` leaves a field
 * unchanged; a null handle clears it (only while the public card is off).
 */
export async function updateFanAccountProfile(
  userId: string,
  input: { displayName?: string; publicHandle?: string | null },
): Promise<FanAccountProfile> {
  const handle = input.publicHandle;
  if (handle) {
    const taken = await query<{ id: string }>(
      `SELECT id FROM fan_users WHERE lower(public_slug) = lower($1) AND id <> $2 LIMIT 1`,
      [handle, userId],
    );
    if (taken.rows.length) throw new AccountProfileError("That handle is already in use.", 409, "publicHandle");
  }
  try {
    const { rows } = await query<ProfileRow>(
      `UPDATE fan_users
          SET display_name = COALESCE($2, display_name),
              public_slug  = CASE WHEN $4::boolean THEN $3 ELSE public_slug END,
              updated_at   = now()
        WHERE id = $1
          AND (NOT public_card OR (CASE WHEN $4::boolean THEN $3 ELSE public_slug END) IS NOT NULL)
        RETURNING ${PROFILE_COLUMNS}`,
      [userId, input.displayName ?? null, handle ?? null, handle !== undefined],
    );
    if (rows[0]) return toProfile(rows[0]);
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      throw new AccountProfileError("That handle is already in use.", 409, "publicHandle");
    }
    throw error;
  }
  const exists = await query(`SELECT 1 FROM fan_users WHERE id = $1`, [userId]);
  if (!exists.rows.length) throw new AccountProfileError("Account not found.", 404);
  throw new AccountProfileError("Turn off your public fan profile before removing your handle.", 400, "publicHandle");
}

/**
 * Verify the current password, store the new hash, and bump the session
 * version so every other signed-in device is signed out. Returns the new
 * session version for re-issuing the current device's cookie.
 */
export async function changeFanAccountPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<number> {
  const row = (await query<{ password_hash: string }>(
    `SELECT password_hash FROM fan_users WHERE id = $1`,
    [userId],
  )).rows[0];
  if (!row) throw new AccountPasswordError("Account not found.", 404);
  if (!(await bcrypt.compare(currentPassword, row.password_hash))) {
    throw new AccountPasswordError("Your current password is incorrect.", 400, "currentPassword");
  }
  if (await bcrypt.compare(newPassword, row.password_hash)) {
    throw new AccountPasswordError("Choose a password you aren’t using now.", 400, "newPassword");
  }
  const nextHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  return withTransaction(async (client) => {
    // Compare-and-swap on the verified hash: a concurrent reset or change wins
    // instead of being silently overwritten.
    const updated = await client.query<{ session_version: number }>(
      `UPDATE fan_users
          SET password_hash = $3, session_version = session_version + 1, updated_at = now()
        WHERE id = $1 AND password_hash = $2
        RETURNING session_version`,
      [userId, row.password_hash, nextHash],
    );
    const version = updated.rows[0]?.session_version;
    if (version === undefined) {
      throw new AccountPasswordError("Your password was just changed somewhere else. Sign in again and retry.", 409);
    }
    // Outstanding reset links must not be able to undo this change.
    await client.query(
      `UPDATE fan_password_reset_tokens SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL`,
      [userId],
    );
    return version;
  });
}

/** Revoke every existing session; the caller re-issues the current device's cookie. */
export async function revokeFanAccountSessions(userId: string): Promise<number | null> {
  const { rows } = await query<{ session_version: number }>(
    `UPDATE fan_users SET session_version = session_version + 1, updated_at = now()
      WHERE id = $1 RETURNING session_version`,
    [userId],
  );
  return rows[0]?.session_version ?? null;
}
