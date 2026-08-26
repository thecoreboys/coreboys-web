# Press kit — `/press` and `/about/[slug]/numbers`

The Core Boys press surface. One public-facing page that sponsors,
labels, and partners reach for when they ask "what's the audience?".

## Audience and intent

Three audiences read this page:

1. **Brand managers** sizing a partnership. They want totals, recency,
   and the ability to bookmark/share a single link.
2. **Booking agents** evaluating talent for events. They want
   per-member breakdowns and quick links to socials.
3. **Internal stakeholders** dropping the URL into pitch decks. The page
   has to look credible at any zoom level — Slack preview, Keynote
   embed, mobile share.

## Surfaces

| Route                  | For                                       |
| ---------------------- | ----------------------------------------- |
| `/press`               | Org-level media kit. The default share.   |
| `/about/[slug]/numbers` | Per-member media kit (Marlon, Ron, etc). |
| `/press/download.pdf`  | (Phase B) Static brand-asset PDF dump.    |

Both pages render server-side, ISR-cache for 1h, and pull live numbers
from `lib/stats.ts` (see `STATS.md`). Stale-while-revalidate keeps the
hot path under 200ms.

## Org page composition

Above the fold:

- **Hero**: oversized wordmark + one-sentence positioning + the four
  headline numbers (cumulative subs, monthly views, peak concurrent
  live, members). Display face. No 3D — keeps the page printable.
- **Live ribbon**: the existing `<LiveDot>` reused inline, "X members
  live now" with a quick link to `/links`.

Below:

- **Numbers grid**: 8 cells. Per-platform rollups (YouTube, Twitch,
  TikTok, Instagram, X) with delta-from-30d-ago when available.
- **Roster table**: every member, primary platform, headline number,
  link to their per-member numbers page.
- **Recent**: 6 most recent posts/clips across all members from
  `coreboys-api`'s `/v1/content` endpoint. Title + thumbnail + member
  pill + posted-at relative time.
- **Bookings + press contact**: real email, mailto: links, response-time
  promise.

Nothing scrolls past 5 screen-heights. Sponsors don't read more than
that.

## Per-member page composition

`/about/[slug]/numbers` reuses the org template tightened to one creator:

- Hero: portrait + stage name + accent rule + headline number.
- Platform breakdown: one card per platform with handle, follower count,
  recent average. Click → opens that platform.
- Recent content: 4-up grid pulled from `/v1/content?member=<slug>`.
- Talent contact: same email used by `/press`.

## Tone and motion

Premium. Cinematic when it moves. Minimal when it doesn't.

- No animations on initial paint. The page commits the layout instantly
  and stays still.
- Micro-interactions: a 200ms accent rule reveal on card hover. A
  letterspacing tighten on the hero on mount.
- 3D scenes are forbidden on this page. The CoreScene canvas is heavy
  and competes with sponsors trying to read numbers. We will absolutely
  not put a particle system between a sponsor and our subscriber count.

## Source-of-truth contract

Every cell on this page must trace back to a function in `lib/stats.ts`
(see `STATS.md`). New numbers ship by extending the schema there, not
by hardcoding into JSX.

When a number can't be fetched (API outage, missing creds), the cell
shows `—` and a tooltip explains "live number unavailable; last known:
{cached value}". The page never fakes a number, and never blocks the
whole page on a single failed call.

## What's intentionally out of scope (Phase A)

- **Engagement rates**. They're heuristic and easy to challenge in a
  pitch meeting. We surface absolutes.
- **Demographics**. Twitch + YouTube don't expose audience demographics
  to public API consumers; the cms can attach them manually in Phase B.
- **Brand-safety scoring**. Out of band; sponsors who care will request
  a manual report.

## Definition of done

- `/press` returns 200 with real Twitch numbers, real YouTube numbers
  when keys present, marked-mock placeholders for TikTok / Instagram
  with a footer note ("third-party data via $source, refreshed hourly")
- Lighthouse score ≥ 95 (page is HTML-mostly; no 3D)
- Per-member page builds for every member, links round-trip cleanly
- Share preview (OG image) shows hero + headline number, member-page
  share preview shows portrait + name + headline
- The numbers we show always trace to a typed fetcher in `lib/stats.ts`
