# Page and player performance

## Strategy

Keep the existing streaming experience and prioritize visible artwork, navigation,
and active playback. Public catalog metadata is shared; account data is private.
Do not increase every cache lifetime to hide slow requests: live transitions,
entitlements, and saved progress have different freshness requirements.

## Implemented

- **Memory → Redis → source:** public snapshots use bounded memory and the existing
  Redis integration. Concurrent requests within each server process share reads
  and rebuilds. Usable stale
  snapshots render while one refresh runs. Redis failure retains its short
  deadline/backoff and never becomes a dependency for successful page rendering.
  The adapter bounds both connection handshakes and responses after a successful
  connection; a server that accepts commands but stops replying cannot leave
  a page or deferred cache write waiting indefinitely.
- **Response first:** Redis encoding, compression, and writes run through Next's
  `after()` callback. Per-key ordering within each server process and remaining
  TTL prevent that process's delayed writes from replacing its newer snapshot or
  extending expired content. Ordering across replicas is not a distributed lock.
- **Cheap warm hits:** validate each immutable snapshot once per validator and
  retain frequently used entries with a 64-entry LRU. Copy cached data before
  modifying it for a page or viewer.
- **Channels and Guide:** reuse public history snapshots (tracker: five minutes;
  airtime: four minutes), remove unused Guide history queries, overlap independent
  reads, and warm provider avatars after sending the channel response.
- **Guide freshness:** use the catalog's existing 20-second fresh / 180-second
  stale policy instead of layering another five-minute catalog cache. Provider
  schedules have separate deadlines and cache lifetimes. Fresh removal checks
  sanitize cached entries without replacing distinct editorial versions of the
  same video. Newly published YouTube videos remain recoverable when an initial
  successful metadata lookup has not indexed them yet.
- **Smaller transfers:** channel and Guide payloads share repeated program and
  creator data through the packed transport. The Guide API retains its legacy
  response for clients that do not request the compact format.
- **Client requests:** Guide, Tonight, and the player guide share one SWR key,
  deduplicate requests, retain the last successful result, and refresh only while
  visible/online. Focus, visibility, and routine catalog polling coalesce;
  observed live changes keep an urgent refresh path.
- **Private personalization:** queue/search overlap public catalog and private
  viewer reads, but responses remain `private, no-store`. Account workspace reads
  wait for sign-in; the passport bridge resets on account changes. Routine creator
  updates use the existing private inbox instead of duplicate floating polling.
- **Optional downloads:** sign-in forms and attached chat load when opened.
  Station audio warms only on station selection or keyboard focus; opening a
  page no longer downloads all seven stations. Save-Data and 2G connections skip optional audio.
  Click-triggered station playback still uses the existing synchronous path.
- **Repeat visits:** station MP3s and PNG brand artwork now receive the same
  bounded browser/CDN cache policy as other public artwork. Filenames are not
  treated as immutable content hashes.
- **Station reliability:** fade progress and output volume are bounded. A browser
  animation-frame timestamp earlier than the fade's start can no longer throw a
  negative-volume error while tuning between networks.
- **Stable navigation:** each auth consumer uses the same loading snapshot for
  server rendering and initial hydration, even when the shared account request
  has already completed. Account redirects can open the lazy sign-in form after
  client navigation. Compact Twitch controls sit above the provider iframe so
  pointer users can expand or stop playback without replacing the media frame.
  Leaving Theater cancels a pending route handoff immediately; browser Back and
  quick minimization cannot reopen it. Portrait tablets keep the picture visible
  initially and open the companion panel on request.
- **Provider visibility:** keep playback controls and nearby decoration clear of
  Twitch's picture. Even a faint outer shadow can make the provider treat its
  iframe as obscured and reject Play/Resume. The control rail and adjacent Watch
  Together button use inset finishes around the full Twitch player.

## Cache boundaries

Redis is configured with `REDIS_URL` (redis/rediss), or a REST URL/token via
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Existing aliases
`REDIS_URL` / `REDIS_TOKEN` also support the REST transport. No new service or
dependency is required. Environment, site, and database identity are hashed into
public-cache keys; `CORE_CACHE_NAMESPACE` can explicitly separate environments.

Never cache account, billing, OAuth, watch progress, or entitlement responses in
the public cache/CDN. Do not apply a blanket cache header to pages or `/api/*`.
Do not cache video segments in Redis. Existing provider players retain their own
playback, authentication, buffering, and adaptive quality behavior.

Shared provider request payloads and removal/verification records are internal
server data. Migration `062_content_private_access.sql` revokes public API-role
access and enables row-level security on those tables while preserving the
existing trusted server grants. Run `node scripts/test-content-private-access-sql.mjs`
to replay and verify the actual schema in a disposable local PostgreSQL container;
the check never reads the production database URL.

## Verification and operation

Run focused cache, route, guide, refresh, and radio tests, then TypeScript and
the production build. A read-only HTTP probe is available:

```sh
node scripts/measure-route-performance.mjs http://127.0.0.1:3000
```

It reports three requests per route, response headers, full-response duration,
and decoded payload bytes. The first request is only an initial sample, not a
guaranteed cache miss; the probe never flushes shared caches. An access-gate
redirect must be tested with an authorized browser session instead. Streaming
header latency alone does not prove the page content is ready.

For release comparisons, use the same production build mode, device, data, and
network conditions. Check desktop/mobile navigation, station dial, player
controls, Guide/return navigation, sign-in, logout/account switch, and provider
outage recovery. Track real-user LCP/INP/CLS and endpoint p50/p95 separately from
local development timings. Third-party player startup remains provider-dependent.

Baseline evidence: the home-page browser check downloaded all seven local station
recordings (1,977,704 file bytes). The final policy removes those automatic
downloads on route load. Intentional station selection/focus and approved alternate
recordings can add subsequent loads; playback continues to load its chosen source.

Local production-snapshot measurements on November 8, 2026: all 24 HTTP probes
returned 200. Warm complete HTML responses across home, CORE channel, Guide,
Shorts, Theater, Multiview, and privacy ranged from 15–288 ms; warm Guide API
responses were 125–158 ms. These are localhost/server response measurements,
not real-user page-render or video-start times. The 54 focused performance and
regression tests passed. Production snapshot compilation and type checking are
separate from the workspace's ongoing UI changes and full-suite status.

The initial production browser smoke check passed home, CORE channel → Flock via
the network dial, Guide, Shorts, Theater, Multiview, privacy, and mobile channel
rendering with no page exceptions or same-origin server failures. Sign-in and
create-account forms opened, switched, and closed successfully; no credentials
were submitted. Initial home navigation downloaded zero station audio files.

Follow-up validation used a normal production build with lint and TypeScript
checks enabled. Broader route checks exposed an authentication hydration race,
account-redirect form state, and an invalid partial dynamic fan-mail route; each
was corrected and checked in a real browser. A rapid account-response regression
reproduced the original hydration error and passed with the fix. Real Twitch and
YouTube programs decoded advancing video frames; Twitch playback also continued
through minimization in the same iframe. Provider readiness, native controls,
ads, and geographic availability remain outside the application's guarantees.

These are local observations from successive verification snapshots. The release
gate requires full lint, types, tests, a normal production build, and browser
checks against the final merged code after concurrent changes have finished.

Framework references: [Next lazy loading](https://nextjs.org/docs/app/guides/lazy-loading),
[Next after](https://nextjs.org/docs/app/api-reference/functions/after),
[SWR request deduplication](https://swr.vercel.app/docs/advanced/performance).

### November 9: homepage startup and live polling

A production browser reload observed `/api/watch/live` taking 11.61 seconds
and an unopened palette requesting the 60-result search seed in 9.63 seconds.
The document completed in 3.92 seconds (headers at 1.74 seconds). These are
individual request observations, not Core Web Vitals or population percentiles.
Footer links also prefetched five routes during startup, including a 5.59-second
cookie-policy request.

Home and live polling now share a separate recent-content snapshot. Its source
reads are bounded to 64 CORE feed entries, 256 member feed entries and 480 archived
YouTube records, followed by the existing balanced home projection. Explicit
archive and search routes retain their full coverage. Fresh/stale windows remain
20/180 seconds, and durable deletion checks still run after cache retrieval.
Search seed requests run on navigation intent rather than an idle timer; policy
footer links no longer prefetch. These changes remove competing archive work
instead of lengthening freshness windows.

Twitch hero embeds have no shadow or rounded clipping, and floating DJ controls
move clear when space permits. A plain, unstyled Twitch control page also failed
the provider's style-visibility autoplay check in the test browser; that isolated
restriction must not be reported as successful video playback.
