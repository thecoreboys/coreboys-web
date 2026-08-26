import "server-only";

import { query } from "@/lib/db";
import { MEMBERS_BY_SLUG, type Member } from "@/lib/members";

type ProfileOverrideRow = {
  bio: string | null;
  comm_name: string | null;
  favorite_game: string | null;
  description: string | null;
  nickname: string | null;
};

/**
 * Apply only the profile fields exposed by the member Studio. A missing
 * migration, unavailable database, or absent row always falls back to the
 * checked-in member record so a profile can never fail because Studio is down.
 */
export async function getMemberWithProfileOverrides(slug: string): Promise<Member | null> {
  const base = MEMBERS_BY_SLUG[slug];
  if (!base) return null;
  try {
    const result = await query<ProfileOverrideRow>(
      `SELECT bio, comm_name, favorite_game, description, nickname
         FROM editable_member_overrides
        WHERE slug = $1
        LIMIT 1`,
      [slug],
    );
    const row = result.rows[0];
    if (!row) return base;
    return {
      ...base,
      bio: row.bio ?? base.bio,
      comm: row.comm_name ? { ...base.comm, name: row.comm_name } : base.comm,
      favoriteGame: row.favorite_game ?? base.favoriteGame,
      description: row.description ?? base.description,
      nickname: row.nickname ?? base.nickname,
    };
  } catch {
    return base;
  }
}
