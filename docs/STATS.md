# Stats data layer

Every number on `/press` and `/about/[slug]/numbers` resolves to a typed
function in `lib/stats.ts`. This document is the contract:

> If a number is on the page, it traces to one of these fetchers.
> If a fetcher can't fetch, the cell renders `—`, never a fake number.

## Sources

| Platform   | Source                              | Auth                  | What we get                                                         |
| ---------- | ----------------------------------- | --------------------- | ------------------------------------------------------------------- |
| YouTube    | YouTube Data API v3                 | API key (server env)  | Channel: subscriberCount, viewCount, videoCount.                    |
| Twitch     | Helix `users` + `streams` (existing)| App access token      | Live state, current viewerCount, login → display name.              |
| TikTok     | _no public API_; manual or scrape   | Phase B               | Followers + total likes captured manually in cms; refreshed weekly. |
| Instagram  | _no public API for non-business_    | Phase B               | Manual capture; refreshed weekly.                                   |
| X / Twitter| Public API requires paid tier       | Phase B               | Manual capture.                                                     |

> **No member logins required.** We pull what's available to public
> API consumers using app-level tokens we already own. Anything that
> requires per-creator login is captured manually in the cms and
> persisted on the member row.

## Module shape

```ts
// lib/stats.ts (server-only)
export type PlatformStat = {
  platform: "youtube" | "twitch" | "tiktok" | "instagram" | "x";
  handle: string;
  url: string;
  /** Cumulative followers / subscribers. */
  followers: number | null;
  /** All-time view count when the platform exposes it. */
  views: number | null;
  /** Recent average — viewers for live, watch time for vod. */
  recent: { window: "7d" | "30d"; value: number } | null;
  /** Monotonic counter of items posted (videos, posts). */
  itemCount: number | null;
  /** ISO timestamp the source was queried at. */
  fetchedAt: string;
  /** When `null`, render `—`; when "stale", render number with a chip. */
  freshness: "live" | "stale" | "manual";
};

export type MemberStats = {
  slug: string;
  primaryPlatform: PlatformStat["platform"];
  platforms: PlatformStat[];
};

export type OrgStats = {
  totals: {
    followersCumulative: number;
    viewsCumulative: number;
    monthlyViews: number | null;
    membersLive: number;
  };
  members: MemberStats[];
  fetchedAt: string;
};

export async function getOrgStats(): Promise<OrgStats>;
export async function getMemberStats(slug: string): Promise<MemberStats | null>;
```

## Caching

- `getOrgStats` and `getMemberStats` are server-only and tagged into
  Next's data cache: `stats:org`, `stats:member:<slug>`.
- Default `revalidate = 3600` (1h). YouTube quota is 10k units/day; one
  channel-stats call costs 1 unit, so 6 members × 24 refreshes = 144
  units, comfortably under quota even with stampedes.
- The Twitch live slice is fetched separately via the existing
  `lib/twitch.ts` (which already caches the app token). The press page
  composes `getOrgStats()` (1h) with the live slice (60s) so live
  states don't go stale even though the cumulative counts do.

## Quota + outage behavior

- Per-platform fetchers wrap their network call in a `safe<T>()` helper
  that catches and returns `null` instead of throwing. One platform
  failing never breaks the page.
- A failed fetch increments a counter on the platform's PlatformStat
  and surfaces a footer note: "Couldn't refresh {platform} just now
  — last known {value}, fetched {time}". The number from the previous
  successful fetch comes from the cms (manual override path).
- A `manual` freshness flag exists for platforms we can't auto-pull
  (TikTok, IG). Cms admins drop in numbers from a weekly capture; the
  page notes "as of {date}" in the cell.

## Env

Add to `.env.local` and Vercel project envs (see
`coreboys-infra/env/ENVIRONMENTS.md`):

```bash
# YouTube Data API v3 — read-only API key
YOUTUBE_API_KEY=AIza...
```

The Twitch creds (`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`) already
exist for the live-status feature.

## Why not aggregate everything in coreboys-api?

Two reasons:

1. **Locality of caching**: Next's data cache + revalidation tags lets
   us purge `stats:org` from the cms without writing a separate webhook.
   Doing this in `coreboys-api` would require duplicating that wiring.
2. **Edge runtime compatibility**: `/press` is a candidate for the
   edge runtime. Talking to YouTube directly from a Next route handler
   keeps it edge-deployable; routing through Hono in `coreboys-api`
   wouldn't.

If we ever need cross-app reuse (e.g., the cms wants to surface stats
in its dashboard), promote `lib/stats.ts` to `@coreboys/shared/stats`
and pull from both web + cms.

## Definition of done

- `lib/stats.ts` exposes `getOrgStats` and `getMemberStats`
- YouTube + Twitch return real data when keys present
- TikTok / Instagram entries render `manual` freshness with values
  stored on the member's `WebExtras` (or null)
- `/press` and `/about/[slug]/numbers` only call these two functions —
  never raw-fetch a platform
- Failed source render as `—` with the freshness footer note
