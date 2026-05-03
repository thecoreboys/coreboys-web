import { NextResponse } from "next/server";
import { MEMBERS } from "@/lib/members";
import { GROUP } from "@/lib/group";
import { fetchUsersByLogin, fetchFollowerCount } from "@/lib/twitch";
import { fetchSocialCount } from "@/lib/social-fetch";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily metrics snapshot writer. Fetches:
 *   • Twitch follower count for every member
 *   • Group YouTube subscribers, TikTok / IG / X followers
 *   • Per-member YouTube / TikTok / IG / X via Social Fetch
 * and upserts one row per (member_slug, platform, today) into Postgres.
 *
 * Reserved slug `__group__` is the umbrella CORE accounts. Any other
 * `member_slug` matches lib/members.ts.
 *
 * Auth: shared secret in `x-cron-secret: <METRICS_CRON_SECRET>` so only
 * the DO App Platform cron job can write. We deliberately don't use
 * `Authorization: Bearer ...` here because the Clerk middleware sees
 * any Bearer header and tries to parse it as a JWT, returning 500 on
 * shapes it doesn't recognise.
 */
export async function POST(req: Request) {
  const secret = process.env.METRICS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "METRICS_CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const provided = (req.headers.get("x-cron-secret") ?? "").trim();
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Each write is now keyed by (slug, platform, handle) so multi-channel
  // members (e.g. Marlon's 3 YouTube channels) snapshot independently.
  const writes: Array<{
    slug: string;
    platform: string;
    handle: string;
    count: number;
  }> = [];

  // ── Per-member Twitch follower count ────────────────────────────────
  try {
    const users = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
    await Promise.all(
      MEMBERS.map(async (m) => {
        const u = users[m.twitchLogin.toLowerCase()];
        if (!u) return;
        const followers = await fetchFollowerCount(u.id);
        if (followers != null && followers > 0) {
          writes.push({
            slug: m.slug,
            platform: "twitch",
            handle: m.twitchLogin.toLowerCase(),
            count: followers,
          });
        }
      }),
    );
  } catch {
    /* ignore — partial snapshot is better than none */
  }

  // ── Per-member YouTube / TikTok / IG / X via Social Fetch ────────────
  await Promise.all(
    MEMBERS.flatMap((m) =>
      m.socials
        .filter((s): s is typeof s & { platform: "youtube" | "tiktok" | "instagram" | "x" } =>
          s.platform === "youtube" ||
          s.platform === "tiktok" ||
          s.platform === "instagram" ||
          s.platform === "x",
        )
        .map(async (s) => {
          const count = await fetchSocialCount(s.platform, s.handle ?? "", s.url);
          if (count != null && count > 0) {
            writes.push({
              slug: m.slug,
              platform: s.platform,
              // The URL is the canonical per-channel identifier (handles
              // can collide across YouTube vanity names; URLs cannot).
              handle: s.url,
              count,
            });
          }
        }),
    ),
  );

  // ── Group accounts (the umbrella CORE socials in lib/group.ts) ──────
  const [ytSubs, ttFollowers, igFollowers, xFollowers] = await Promise.all([
    fetchSocialCount(
      "youtube",
      GROUP.socials.youtube.handle,
      GROUP.socials.youtube.url,
    ),
    fetchSocialCount("tiktok", GROUP.socials.tiktok.handle),
    fetchSocialCount("instagram", GROUP.socials.instagram.handle),
    fetchSocialCount("x", GROUP.socials.x.handle),
  ]);
  const groupRows: Array<{ platform: string; handle: string; count: number | null }> = [
    { platform: "youtube", handle: GROUP.socials.youtube.url, count: ytSubs },
    { platform: "tiktok", handle: GROUP.socials.tiktok.url, count: ttFollowers },
    { platform: "instagram", handle: GROUP.socials.instagram.url, count: igFollowers },
    { platform: "x", handle: GROUP.socials.x.url, count: xFollowers },
  ];
  for (const r of groupRows) {
    if (r.count != null && r.count > 0) {
      writes.push({
        slug: "__group__",
        platform: r.platform,
        handle: r.handle,
        count: r.count,
      });
    }
  }

  // Dedupe by (slug, platform, handle) — guards against duplicate
  // entries within the same run (e.g. retry quirks). We do NOT sum
  // across handles anymore: each channel keeps its own count.
  const merged = new Map<string, (typeof writes)[number]>();
  for (const w of writes) {
    merged.set(`${w.slug}::${w.platform}::${w.handle}`, w);
  }
  const deduped = [...merged.values()];

  // ── Upsert in a single statement using a values list ────────────────
  if (deduped.length === 0) {
    return NextResponse.json(
      { ok: true, written: 0, note: "no upstream data — APIs may be misconfigured" },
    );
  }

  const values: unknown[] = [];
  const placeholders = deduped
    .map((w, i) => {
      const base = i * 4;
      values.push(w.slug, w.platform, w.handle, w.count);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, CURRENT_DATE, NOW())`;
    })
    .join(", ");

  const sql = `
    INSERT INTO metric_snapshots (member_slug, platform, handle, count, snapshot_date, taken_at)
    VALUES ${placeholders}
    ON CONFLICT (member_slug, platform, handle, snapshot_date)
    DO UPDATE SET count = EXCLUDED.count, taken_at = EXCLUDED.taken_at
  `;

  await query(sql, values);

  return NextResponse.json({
    ok: true,
    written: deduped.length,
    snapshotDate: new Date().toISOString().slice(0, 10),
  });
}
