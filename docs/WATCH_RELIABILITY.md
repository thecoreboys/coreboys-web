# Watch reliability and deployment notes

This change requires **Node.js 20 or newer**. Production deployment uses `.github/workflows/deploy-azure.yml`: pushing `main` builds an immutable image, applies the registered database migrations, and rolls out Azure Container Apps. Provider permissions remain controlled by each connected account's OAuth grant.

## Redis configuration

Configure one transport in the server environment:

| Transport | Variables |
| --- | --- |
| Native Redis | `REDIS_URL=redis://…` or `REDIS_URL=rediss://…`; include authentication in the URL when required. |
| Upstash REST | `UPSTASH_REDIS_REST_URL=https://…` and `UPSTASH_REDIS_REST_TOKEN`. |
| REST compatibility aliases | An HTTP(S) `REDIS_URL` plus `REDIS_TOKEN`. |

The Upstash URL takes precedence over `REDIS_URL`; the Upstash token takes precedence over `REDIS_TOKEN`. Native Redis does not use a separate REST token. These variables belong on the server and must not use a `NEXT_PUBLIC_` prefix.

The Azure workflow maps these GitHub repository secrets to runtime secret references. Production uses a dedicated `coreboys-web-cache` container app in the existing `coreboys-prod-env`, reachable only through internal TCP ingress on port 6379 and protected by a generated password. It runs one replica with 0.25 CPU / 0.5 GiB memory, a 128 MiB cache limit, and `allkeys-lru` eviction. Redis data is disposable and persistence is disabled; restarts refill public caches from their sources. The connection URL belongs in the `REDIS_URL` repository secret, never in source control.

Redis is optional. Missing configuration or an outage falls back to an in-process public cache. Native startup, including its Redis handshake, and the command share an 800 ms deadline. Failed native connections are destroyed. Both transports back off for 15 seconds after a failure. Simultaneous requests in one process share a connection attempt and cache rebuild; rebuild coordination is not a distributed lock.

## Public cache freshness

Only public catalog, Twitch directory/archive, avatar, and Patreon teaser data uses this cache. Account activity, billing details, and OAuth tokens are excluded. Local memory holds at most 64 entries. Shared keys use a hash of `CORE_CACHE_NAMESPACE`, `NEXT_PUBLIC_SITE_URL`, and `DATABASE_URL`; set a distinct `CORE_CACHE_NAMESPACE` when separate environments otherwise share those values.

| Snapshot | Fresh window | Additional stale window | Maximum stored snapshot age |
| --- | --- | --- | --- |
| Watch catalog, including live status | 20 seconds | 40 seconds | 60 seconds |
| Member avatars | 1 hour | 24 hours | 25 hours |
| Twitch public user directory | 1 hour | 24 hours | 25 hours |
| Twitch channel archive while live | 1 minute | 6 hours | 6 hours 1 minute |
| Twitch channel archive while offline | 30 minutes | 6 hours | 6 hours 30 minutes |
| Public Patreon shelf | 5 minutes | 15 minutes | 20 minutes |

Stale snapshots return immediately and schedule refresh through Next.js `after()`. A failed refresh does not extend the original expiry. Empty degraded loads do not replace good snapshots. Expired entries require a fresh load. These are snapshot lifetimes; upstream provider caching can have its own freshness rules.

The Twitch archive keeps one shared snapshot per channel. When that channel becomes live, the cache requests refresh after 60 seconds even if the snapshot was created with the offline policy; it retains the original stale expiry. Directory and archive caches preserve the last nonempty result through brief provider failures. They do not lengthen the live-status cache window.

## Account watch measurements

Migration `scripts/migrations/052_account_watch_measurement.sql` adds measured-event metadata and an account-scoped playback cursor, including fractional-second carry. It is registered in `pnpm db:apply-web-migrations`; the runtime schema guard includes the same additive changes. Apply the migration to the intended production `DATABASE_URL` before production rollout, using the existing migration process. The runner applies its full registered migration list, not just migration 052.

Passport `watchAnalytics` totals include only measured CORE playback events for the signed-in account. Playback advancement, elapsed time, session continuity, and playback speed bound credit; pauses, seeks, duplicate observations, and manual “watched” marks do not add measured time. Existing historical counters are retained without being relabeled as verified playback. Passport event/quest credit remains separate from total measured viewing time.

Twitch and YouTube players watched inside CORE contribute to CORE totals, with a platform breakdown. Connecting an account does **not** import viewing history from that platform’s own website or app. Following/subscription checks depend on provider permissions and available APIs: missing, failed, or stale observations display as unknown; unsupported platforms display that limitation.

## Local verification

Focused checks include `tests/public-cache.test.ts`, `tests/redis-deadline.test.ts`, `tests/account-watch-measurement.test.ts`, `tests/account-following.test.ts`, and `tests/passport-watch-display.test.ts`. The Redis deadline test uses a local TCP endpoint that accepts connections without answering, then verifies backoff and reconnection. It does not require a production Redis service.

Browser checks covered account/settings and billing, Passport navigation, persistent DVR saves, custom lists, watched filters, YouTube playback controls, and responsive multiview. A temporary account recorded 1m 23s of YouTube and 1m 32s of Twitch playback in Passport's platform breakdown. Warm homepage responses from a local production build measured approximately 80 ms; this is a local observation, not a production latency guarantee.

Twitch's iframe remains unobstructed and interactive, with CORE controls outside it. In the Codex in-app browser, Twitch still rejected muted autoplay with its `style visibility` warning, including on a separate bare HTML page containing only an 800×450 iframe. Native Twitch Play successfully started both a broadcast and a live stream. Autoplay behavior therefore still needs verification in the deployed site's supported browsers. Do not count a loaded or nominally playing iframe as watched without playback evidence.
