import { NextResponse } from "next/server";
import { CREW, MEMBERS } from "@/lib/members";
import { GROUP } from "@/lib/group";
import { fetchUsersByLogin, fetchFollowerCount } from "@/lib/twitch";
import { fetchSocialCount } from "@/lib/social-fetch";
import { crewMetricSlug, socialHandle } from "@/lib/social-metric-format";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SnapshotSocialPlatform = "youtube" | "tiktok" | "instagram" | "x";

function isSnapshotSocialPlatform(platform: string): platform is SnapshotSocialPlatform {
  return platform === "youtube" || platform === "tiktok" || platform === "instagram" || platform === "x";
}

/**
 * Daily metrics snapshot writer. Fetches:
 *   • Twitch follower count for every member and crew account
 *   • Group YouTube subscribers, TikTok / IG / X followers
 *   • Per-member and per-crew YouTube / TikTok / IG / X via Social Fetch
 * and upserts one row per (member_slug, platform, handle, today) into Postgres.
 *
 * Reserved slug `__group__` is the umbrella CORE accounts; crew accounts use
 * `__crew__:<slug>`. Unprefixed `member_slug` values match lib/members.ts.
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

  const memberTwitchTargets = MEMBERS.map((member) => ({
    slug: member.slug,
    login: member.twitchLogin.toLowerCase(),
    // Preserve the existing member snapshot key for backwards compatibility.
    handle: member.twitchLogin.toLowerCase(),
  }));
  const crewTwitchTargets = CREW.flatMap((crew) =>
    crew.socials
      .filter((social) => social.platform === "twitch")
      .flatMap((social) => {
        const fromHandle = social.handle?.trim().replace(/^@+/, "");
        let fromUrl = "";
        try {
          fromUrl = new URL(social.url).pathname.split("/").filter(Boolean)[0] ?? "";
        } catch {
          /* malformed public URL: skip this social below */
        }
        const login = (fromHandle || fromUrl).toLowerCase();
        return login
          ? [{ slug: crewMetricSlug(crew.slug), login, handle: social.url }]
          : [];
      }),
  );
  const twitchTargets = [...memberTwitchTargets, ...crewTwitchTargets];

  const collectTwitch = async () => {
    try {
      const users = await fetchUsersByLogin([
        ...new Set(twitchTargets.map((target) => target.login)),
      ]);
      await Promise.all(
        twitchTargets.map(async (target) => {
          try {
            const user = users[target.login];
            if (!user) return;
            const followers = await fetchFollowerCount(user.id);
            if (followers != null && followers > 0) {
              writes.push({
                slug: target.slug,
                platform: "twitch",
                handle: target.handle,
                count: followers,
              });
            }
          } catch {
            /* ignore this account; other snapshot rows can still succeed */
          }
        }),
      );
    } catch {
      /* ignore — partial snapshot is better than none */
    }
  };

  const socialTargets: Array<{
    slug: string;
    platform: SnapshotSocialPlatform;
    handle: string;
    url: string;
  }> = [
    ...MEMBERS.flatMap((member) =>
      member.socials
        .filter((social) => isSnapshotSocialPlatform(social.platform))
        .map((social) => ({
          slug: member.slug,
          platform: social.platform as SnapshotSocialPlatform,
          handle: socialHandle(social),
          url: social.url,
        })),
    ),
    ...CREW.flatMap((crew) =>
      crew.socials
        .filter((social) => isSnapshotSocialPlatform(social.platform))
        .map((social) => ({
          slug: crewMetricSlug(crew.slug),
          platform: social.platform as SnapshotSocialPlatform,
          handle: socialHandle(social),
          url: social.url,
        })),
    ),
    ...Object.entries(GROUP.socials)
      .filter(([platform]) => isSnapshotSocialPlatform(platform))
      .map(([platform, social]) => ({
        slug: "__group__",
        platform: platform as SnapshotSocialPlatform,
        handle: socialHandle({ platform, ...social }),
        url: social.url,
      })),
  ];

  // Start every independent upstream together. Public scrapers remain a
  // cron-only fallback, but one slow platform can no longer delay later
  // member, crew, or group phases before the single durable write.
  await Promise.all([
    collectTwitch(),
    Promise.all(
      socialTargets.map(async (target) => {
        try {
          const count = await fetchSocialCount(
            target.platform,
            target.handle,
            target.url,
          );
          if (count != null && count > 0) {
            writes.push({
              slug: target.slug,
              platform: target.platform,
              // URLs are canonical for Social Fetch platforms; handles can
              // collide across renamed or vanity channels.
              handle: target.url,
              count,
            });
          }
        } catch {
          /* ignore this account; other snapshot rows can still succeed */
        }
      }),
    ),
  ]);

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
