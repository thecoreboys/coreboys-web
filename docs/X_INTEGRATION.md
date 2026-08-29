# X integration operator notes

## Runtime model

- Visitor pages read the Postgres roster snapshot and Community metadata cache.
  They never call the X API.
- Production hides roster snapshots older than 24 hours. Local development has
  no scheduler, so it may render the last protected snapshot for a bounded
  seven days; this fallback reads disk only and can never call X. The readiness
  report distinguishes production freshness from local-QA usability.
- The protected `/api/social/x/refresh` cron makes one combined recent-search
  request for the configured CORE roster. It reserves the request's bounded
  `max_results` cost before calling X, then reconciles the returned post count.
- Community metadata refreshes use the same monthly advisory lock and reserve
  the exact number of due IDs. Each lookup has a 10-second timeout; failures
  receive a six-hour negative cache to prevent hourly retry storms.
- Stale spend reservations expire after 15 minutes. The admin X page reports
  usage, pending reservations, estimated spend, remaining gate, action states,
  and cache health.

Apply `scripts/migrations/019_x_integration.sql` before enabling these paths and
run `pnpm social:check -- --strict` as the safe readiness check.

## Configuration

The local OAuth callback is
`http://localhost:3003/api/oauth/x/callback`; production uses
`https://thecoreboys.com/api/oauth/x/callback`. Configure those exact redirects
in the X Developer Console. The application does not change console settings.

`X_COMMUNITIES_JSON` accepts only exact numeric Community IDs or canonical
`https://x.com/i/communities/<id>` URLs for the keys `core`, `flock`, `stable`,
`thugs`, `m3`, `nms`, and `slg`. Missing IDs render an honest unconfigured
state. `X_FEATURED_POST_IDS` supplies at most one fallback editorial post; an
admin-featured approved nomination takes precedence.

The following creator Communities were verified in Chrome against the page
description and owner on 2026-08-23:

| Key | Owner/channel | Verified Community URL | Local status |
| --- | --- | --- | --- |
| `flock` | Adapt / Flock | `https://x.com/i/communities/1846278604495138826` | Configured |
| `stable` | StableRonaldo / Stable | `https://x.com/i/communities/1863444310034702669` | Configured |
| `thugs` | Lacy / Thugs | `https://x.com/i/communities/2001078933861884415` | Configured |
| `m3` | Marlon / M3 | `https://x.com/i/communities/1926380245063520455` | Configured |
| `nms` | JasonTheWeen / NMS | `https://x.com/i/communities/1882332006949744648` | Configured |
| `slg` | Silky / SLG | `https://x.com/i/communities/1552952920630493185` | Configured |
| `core` | CORE network | — | Not configured; no verified official Community found |

Do not use Community `1864772098331496685` for `core`. Its owner is
`@createownrun`, not the official CORE network account. Keeping `core` absent
is intentional and prevents an unrelated Community from being presented as
official.

### Shared-feed refresh health

The GitHub `cron-x-feed` workflow is the only recurring roster-fetcher. It
runs every five minutes against the canonical production origin and fails with
the safe server response body in the Actions log. A visitor refresh never
triggers an X request.

The deployed container must receive all of the following GitHub secrets:
`X_BEARER_TOKEN`, `X_API_CREDIT_BALANCE_USD`, `X_API_MONTHLY_CEILING_USD`,
`X_API_READ_POST_UNIT_USD`, and `X_API_READ_USER_UNIT_USD`. The two read-price
values are intentionally required by the spend gate; without them a refresh
fails safely with `budget_price_missing` before contacting X. Admin → X shows
the snapshot freshness, last attempt, and safe failure label for recovery.

Paid reads and writes fail closed unless declared credits, a positive monthly
ceiling, and the relevant current unit estimate are configured. Native writes
also require `X_NATIVE_ACTIONS_ENABLED=true` and OAuth client credentials. Keep
the example defaults at zero/false until the operator has confirmed current X
pricing and account credits.

## Privacy and interaction

Official embeds are link-only until the viewer selects **Load X post** or the
separate **Always load X posts** preference. The analytics-cookie choice never
authorizes X. The preference is stored as `coreboys-x-embeds`; GPC and Data
Saver continue to require a click. Loaded embeds request DNT, and a normal X
permalink remains available even if the widget is denied or blocked.

Official reply, repost, like, and follow Web Intents are the default. Native
write actions use a separate OAuth step-up, explicit per-action confirmation,
same-origin and signed CSRF validation, idempotency keys, fan/action rate
limits, an audit row, a 12-second outbound timeout, and the shared spend gate.
Reconnect failures are recorded with zero billable cost.

## Communities limitations and moderation

X's documented Communities API supports Community lookup/search metadata; it
does not document a Community timeline, join/membership mutation, or publish-
into-Community endpoint. The site therefore uses exact Community links plus
moderated fan post nominations. Publishing into a Community is hard-disabled
even if an environment variable is set. Do not fabricate IDs, membership, or a
Community feed.

Moderators can approve or deny nominations and select one sitewide featured
post. The database enforces the singleton feature. Submitter notes remain
private moderator context. Account export includes the fan's nomination rows,
and FanZone community-data deletion removes those rows and their cascaded audit
history; OAuth tokens and internal moderation actors are never exported.

Official references: [embedded posts](https://docs.x.com/x-for-websites/embedded-posts/overview),
[Web Intents](https://docs.x.com/x-for-websites/web-intents/overview),
[OAuth 2.0 authorization code flow](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code),
[Communities lookup](https://docs.x.com/x-api/communities/lookup/introduction), and
[X API pricing](https://docs.x.com/x-api/getting-started/pricing).
