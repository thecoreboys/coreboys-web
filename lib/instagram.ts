/**
 * Instagram integration for the /media page.
 *
 *   - `fetchInstagramMedia` pulls recent media from the Instagram Graph
 *     API through the same encrypted-vault / per-account credential resolver
 *     as the Watch catalog. Missing credentials return [] and never throw.
 *   - `instagramSourceSeeds` derives the real handles to seed the
 *     `instagram_sources` table from lib/members + lib/group.
 *   - `getEnabledInstagramSources` reads the table (ensuring + seeding it
 *     on first read) and returns only the enabled rows.
 *
 * The Graph API is the only first-party way to read IG media. Per-handle
 * pulls for arbitrary public accounts are not possible: each professional
 * account must authorize the app, or have an explicit server-side token-map
 * entry. Exact-handle resolution keeps provider media correctly attributed.
 */

import "server-only";
import { MEMBERS } from "@/lib/members";
import { GROUP } from "@/lib/group";
import {
  ensureInstagramSchema,
  query,
  type InstagramSourceSeed,
} from "@/lib/db";
import { socialCredentialFor, type SocialCredential } from "@/lib/watch/social-credentials";

export type InstagramPost = {
  id: string;
  permalink: string;
  mediaUrl: string;
  caption?: string;
  timestamp: string;
};

export type InstagramSource = {
  id: number;
  ownerLabel: string;
  handle: string;
  kind: string;
  enabled: boolean;
  createdAt: string;
};

/** Strip a leading @ and surrounding whitespace from an IG handle. */
export function normalizeHandle(raw: string | undefined | null): string {
  return (raw ?? "").trim().replace(/^@+/, "").toLowerCase();
}

/**
 * Build the seed list from the real CORE handles: every member's
 * instagram social plus the group instagram. De-duplicated by handle.
 */
export function instagramSourceSeeds(): InstagramSourceSeed[] {
  const seeds: InstagramSourceSeed[] = [];
  const seen = new Set<string>();

  const add = (handle: string, ownerLabel: string, kind: string) => {
    const h = normalizeHandle(handle);
    if (!h || seen.has(h)) return;
    seen.add(h);
    seeds.push({ handle: h, ownerLabel, kind });
  };

  for (const m of MEMBERS) {
    const ig = m.socials.find((s) => s.platform === "instagram");
    const handle = ig?.handle ?? ig?.url;
    if (handle) add(igHandleFrom(handle), m.stageName, "member");
  }

  const groupIg = GROUP.socials.instagram;
  if (groupIg) add(igHandleFrom(groupIg.handle ?? groupIg.url), GROUP.name, "group");

  return seeds;
}

/** Pull a bare handle out of either an @handle or an instagram.com URL. */
function igHandleFrom(value: string): string {
  if (!value) return "";
  if (value.startsWith("http")) {
    try {
      const u = new URL(value);
      const seg = u.pathname.split("/").filter(Boolean)[0];
      return normalizeHandle(seg);
    } catch {
      return "";
    }
  }
  return normalizeHandle(value);
}

/**
 * Fetch recent Instagram media for one connected account. Credentials are
 * resolved by exact handle through the encrypted OAuth vault, the server-only
 * account map, or the exact-handle legacy variables. This prevents one token
 * from being reused and mislabeled under every enabled Instagram source.
 *
 * A numeric `handleOrUserId` retains the old direct-user-id path for callers
 * that already hold an explicit legacy token. Returns [] on missing
 * credentials or any provider error — never throws.
 */
export async function fetchInstagramMedia(
  handleOrUserId: string,
  limit = 12,
): Promise<InstagramPost[]> {
  const isNumericId = /^\d+$/.test(handleOrUserId);
  let credential: SocialCredential | null;
  if (isNumericId) {
    const accessToken = process.env.INSTAGRAM_TOKEN?.trim();
    credential = accessToken
      ? {
          accessToken,
          username: "",
          providerUserId: handleOrUserId,
          source: "env",
          instagramApi: process.env.INSTAGRAM_API_MODE === "facebook" ? "facebook" : "instagram",
        }
      : null;
  } else {
    credential = await socialCredentialFor("instagram", handleOrUserId);
  }
  if (!credential) return [];

  const version = /^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION ?? "")
    ? process.env.META_GRAPH_API_VERSION!
    : "v26.0";
  if (credential.instagramApi === "facebook" && !credential.providerUserId) return [];

  try {
    const target = credential.providerUserId
      ? encodeURIComponent(credential.providerUserId)
      : "me";
    const base = credential.instagramApi === "facebook"
      ? `https://graph.facebook.com/${version}/${target}/media`
      : `https://graph.instagram.com/${version}/${target}/media`;

    const fields = "id,permalink,media_url,thumbnail_url,caption,timestamp,media_type";
    const params = new URLSearchParams({
      fields,
      limit: String(Math.max(1, Math.min(limit, 50))),
      access_token: credential.accessToken,
    });

    const res = await fetch(`${base}?${params}`, {
      // Cache for an hour — IG rate limits are tight.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];

    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        permalink?: string;
        media_url?: string;
        thumbnail_url?: string;
        caption?: string;
        timestamp?: string;
        media_type?: string;
      }>;
    };
    if (!json.data) return [];

    return json.data
      .map((d): InstagramPost | null => {
        const mediaUrl =
          d.media_type === "VIDEO" ? d.thumbnail_url ?? d.media_url : d.media_url;
        if (!mediaUrl || !d.permalink) return null;
        return {
          id: d.id,
          permalink: d.permalink,
          mediaUrl,
          caption: d.caption,
          timestamp: d.timestamp ?? "",
        };
      })
      .filter((p): p is InstagramPost => p !== null)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Read all Instagram sources from the DB (ensuring + seeding the schema
 * first). Returns [] on any error so callers never crash.
 */
export async function getAllInstagramSources(): Promise<InstagramSource[]> {
  try {
    await ensureInstagramSchema(instagramSourceSeeds());
    const r = await query<{
      id: number;
      owner_label: string | null;
      handle: string | null;
      kind: string | null;
      enabled: boolean;
      created_at: string;
    }>(
      `SELECT id, owner_label, handle, kind, enabled, created_at::text
         FROM instagram_sources
        ORDER BY kind = 'group' DESC, owner_label ASC NULLS LAST, id ASC`,
    );
    return r.rows.map((row) => ({
      id: row.id,
      ownerLabel: row.owner_label ?? "",
      handle: row.handle ?? "",
      kind: row.kind ?? "",
      enabled: row.enabled,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

/** Only the enabled sources. Returns [] on any error. */
export async function getEnabledInstagramSources(): Promise<InstagramSource[]> {
  const all = await getAllInstagramSources();
  return all.filter((s) => s.enabled);
}

/**
 * Toggle (or set) the `enabled` flag for a source identified by id or
 * handle. Returns the updated row, or null if not found / on error.
 */
export async function setInstagramSourceEnabled(
  selector: { id?: number; handle?: string },
  enabled: boolean,
): Promise<InstagramSource | null> {
  try {
    await ensureInstagramSchema(instagramSourceSeeds());
    const byId = typeof selector.id === "number";
    const r = await query<{
      id: number;
      owner_label: string | null;
      handle: string | null;
      kind: string | null;
      enabled: boolean;
      created_at: string;
    }>(
      `UPDATE instagram_sources
          SET enabled = $1
        WHERE ${byId ? "id = $2" : "handle = $2"}
      RETURNING id, owner_label, handle, kind, enabled, created_at::text`,
      [enabled, byId ? selector.id : normalizeHandle(selector.handle)],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      ownerLabel: row.owner_label ?? "",
      handle: row.handle ?? "",
      kind: row.kind ?? "",
      enabled: row.enabled,
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}
