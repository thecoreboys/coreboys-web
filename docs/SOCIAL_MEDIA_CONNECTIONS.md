# Social media connection check

Run the read-only operator check from `coreboys-web`:

```bash
pnpm social:check
```

It prints only readiness booleans, public roster handles, counts, and a safe
database error code when the encrypted OAuth vault cannot be reached. It never
prints tokens, token lengths, provider user IDs, database hosts, or secrets.

For machine-readable output or a non-zero exit when any expected source is
incomplete:

```bash
pnpm social:check -- --json
pnpm social:check -- --strict
```

## What each status means

- **Twitch live and past broadcasts:** `TWITCH_CLIENT_ID` and
  `TWITCH_CLIENT_SECRET` are both set. Helix `/streams` provides current live
  rooms; Helix `/videos?type=archive` provides retained past broadcasts.
- **YouTube videos:** checked-in channel IDs or valid
  `YOUTUBE_CHANNEL_IDS_JSON` entries can use public RSS without a secret.
  `YOUTUBE_API_KEY` is still required for reliable Shorts/duration/live-state
  enrichment and upcoming YouTube broadcasts.
- **TikTok videos:** every CORE/member handle needs an authorized token with
  `video.list`, either in the encrypted OAuth vault or
  `TIKTOK_ACCOUNT_TOKENS_JSON`. `TIKTOK_CLIENT_KEY` and
  `TIKTOK_CLIENT_SECRET` enable the authorization flow but do not themselves
  grant access to creator media. See [TikTok production setup](./TIKTOK_INTEGRATION.md)
  for the exact products, scopes, URLs, review evidence, and seven creator
  grants required by the channel rails.
- **Instagram photos and Reels:** every CORE/member professional account needs
  `instagram_business_basic` (or a supported legacy `instagram_basic` grant),
  either in the encrypted OAuth vault or
  `INSTAGRAM_ACCOUNT_TOKENS_JSON`. The Instagram client ID/secret pair enables
  authorization but does not itself grant media access.
- **X posts and Communities:** `X_BEARER_TOKEN` lets the protected cron refresh
  one cached roster feed; ordinary page requests never call X. Exact Community
  IDs belong in `X_COMMUNITIES_JSON`—a profile URL is never treated as a
  Community. Set current read-unit estimates, declared remaining credits, and
  a monthly ceiling before paid refreshes; zero/unknown pricing fails closed.
  Fan OAuth starts read-only. One-tap like/reply/repost actions require the
  explicit native-write switch, step-up scopes, per-action confirmation, and
  the same spend gate. Official Web Intents remain available without native
  writes. X does not document Community timeline or Community-publish APIs, so
  those capabilities remain unavailable rather than being simulated.

  X profile/feed ownership is fixed one-to-one: CORE → CORE, Adapt → Flock,
  StableRonaldo → Stable, Lacy → Thugs, Marlon → M3, JasonTheWeen →
  NMS, and Silky → SLG. The cached roster request and Community directory use
  the same canonical map, so a creator's posts cannot be assigned to another
  channel by a second drifting list. `pnpm social:check` reports both configured
  profile owners and cached-post coverage per owner. A configured X profile is
  not the same thing as a configured X Community: each Community still needs
  its exact numeric ID in `X_COMMUNITIES_JSON`.
  The six creator Communities are required by the strict readiness check. The
  CORE network slot remains explicitly optional until an official Community
  can be verified; an unrelated similarly named Community must not satisfy it.
- **Encrypted OAuth vault:** `DATABASE_URL` plus `FAN_OAUTH_KEY` or
  `FAN_SESSION_SECRET` must be usable. The check reads only provider,
  public username, scopes, and revocation status; encrypted token columns are
  never selected.

The legacy single-account TikTok/Instagram variables remain exact-handle
fallbacks. They cannot be reused for a different roster handle.

## Retired sources

The historical YouTube `@LacyIRLs` entry is deliberately excluded from CORE's
web roster and connection checks. It is not replaced with a similarly named
channel.

Missing credentials intentionally produce empty catalog rows. No connector
scrapes or fabricates posts to make a source look connected.
