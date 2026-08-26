# TikTok creator-feed production setup

CORE uses TikTok's official Display API for creator media. Public creator
rails read only the server-side `TIKTOK_ACCOUNT_TOKENS_JSON` account map; they
never read a viewer's connected TikTok account. Viewer OAuth remains a separate
optional account feature and cannot add a source to the public feed.

TikTok still requires each creator account to authorize the app once before a
Display API token can be issued. That initial provider permission is not a
viewer-facing CORE OAuth flow and must be completed by the account owner. Do
not replace it with browser-session scraping.

## Current launch blocker

As of 2026-08-23, `https://thecoreboys.com/` and the paths below return Vercel
`404 DEPLOYMENT_NOT_FOUND`. Do not submit the Production review while that is
true. TikTok requires a fully developed public website, working policy links,
verified URL ownership, and a demo whose domain matches the configured Web URL.

Deploy the site and attach the domain first, then verify all four URLs return
the expected page or callback response over HTTPS:

- Website: `https://thecoreboys.com/`
- Redirect URI: `https://thecoreboys.com/api/oauth/tiktok/callback`
- Privacy Policy: `https://thecoreboys.com/legal/privacy`
- Terms of Service: `https://thecoreboys.com/legal/terms`

The callback can return an OAuth error when opened without `code` and `state`;
it only needs to be deployed and routable. It must not return a hosting 404.

## Current Sandbox

TikTok Sandbox `CoreTV Creator Feed QA` (`7677256440532207637`) was created on
2026-08-23 and its configuration is now applied and persisted. It is configured
for Web, Login Kit, and the exact read-only scopes `user.info.basic`,
`user.info.profile`, and `video.list`. Its Login Kit configuration contains both
saved callbacks:

- `https://127-0-0-1.sslip.io:3003/api/oauth/tiktok/callback`
- `https://thecoreboys.com/api/oauth/tiktok/callback`

The applied Sandbox icon is the resized user artwork at
`public/brand/tiktok-app-icon-1024.png` (1024 x 1024 PNG). These are Sandbox
settings only; the Production app has not been submitted or released.

The website does not need to be publicly launched to finish UI work locally,
but TikTok's real Web OAuth redirect cannot return to `http://localhost`.
End-to-end Sandbox authorization can use the local HTTPS workflow below. Do
not point the production domain at an unfinished local build merely to satisfy
the callback requirement.

## Local HTTPS Sandbox authorization

Use the dedicated, non-default development script for a local TikTok OAuth
round trip:

```bash
pnpm dev:https:tiktok
```

It runs the installed Next.js development server at
`https://127-0-0-1.sslip.io:3003`. That hostname resolves to `127.0.0.1`, so
Next.js binds to this machine's loopback interface rather than exposing a LAN
listener or public tunnel. A startup preflight fails closed unless DNS resolves
the hostname exclusively to loopback. The normal `pnpm dev` command remains
HTTP on its usual port. The matching pre-script also runs the same
database-firewall setup as normal development before HTTPS starts.

On first use, Next.js generates a local self-signed development certificate
and may ask for permission to install its local certificate authority. The
browser may show a certificate warning until that trust step succeeds; reopen
the browser if necessary and confirm the address is
`https://127-0-0-1.sslip.io:3003` before starting OAuth. The hostname passed to
Next.js is also included in the generated certificate. If an older
localhost-only certificate exists, Next.js regenerates it for this hostname.
If Next.js reports that it fell back to HTTP, stop and fix the local certificate
trust instead of continuing, because TikTok will reject the resulting callback.
The generated `certificates/` directory is gitignored and must not be
committed.

In the TikTok **Sandbox** Login Kit configuration, register this exact redirect
URI:

```text
https://127-0-0-1.sslip.io:3003/api/oauth/tiktok/callback
```

Then open `https://127-0-0-1.sslip.io:3003` once and confirm the browser trusts
the certificate. Sign in to CORE at that same origin, open `/account`, and
select Connect for TikTok. Always start and finish the flow with the literal
`127-0-0-1.sslip.io` hostname; `https://localhost:3003`,
`https://127.0.0.1:3003`, HTTP, and a different port produce different redirect
URIs and will not match this Sandbox registration. TikTok rejects `localhost`
for this Web Sandbox even when it uses HTTPS.

The OAuth start route derives the redirect from the incoming request origin,
and the token exchange reuses that same signed origin. No public tunnel,
deployment, `NEXT_PUBLIC_SITE_URL` override, or secret in the command is
required. Keep the sslip.io loopback redirect out of the Production app
configuration; this local path tests Sandbox authorization but does not satisfy
production URL ownership or review requirements.

## Production Developer Portal values

The intended Production values remain below. Production has not been submitted
or released:

| Field | Value |
| --- | --- |
| Website URL | `https://thecoreboys.com/` |
| Login Kit redirect URI | `https://thecoreboys.com/api/oauth/tiktok/callback` |
| Privacy Policy URL | `https://thecoreboys.com/legal/privacy` |
| Terms of Service URL | `https://thecoreboys.com/legal/terms` |
| Icon | `public/brand/tiktok-app-icon-1024.png` (1024 x 1024 PNG) |
| Products | Login Kit and TikTok API / Display API |
| Platform | Web only |

Do not add the sslip.io loopback callback or localhost to Production. TikTok Web
redirect URIs must be static, absolute HTTPS URLs, contain no query string or
fragment, and match the value sent during both authorization and token
exchange.

For an app created after 2024-09-09, verify ownership of the Website, Privacy,
and Terms URL properties from the Production app page before review.

## Scopes and review justification

Request exactly these scopes—nothing for publishing, comments, private data, or
statistics:

- `user.info.basic`: show the account's display name and avatar and retain its
  app-scoped TikTok identifier.
- `user.info.profile`: read the exact public `@username`. CORE uses it to bind
  the consented grant to the matching creator rail instead of guessing from a
  changeable display name.
- `video.list`: list that consenting account's recent public videos for its
  `/channels/...` page and custom player.

Public app description (109 of 120 characters):

> CORE TV organizes live streams, videos, replays, shorts, and public creator media in one entertainment guide.

Suggested review explanation:

> Login Kit starts from Account > Connected accounts > TikTok. After the person
> consents, our server exchanges the authorization code, reads the account's
> avatar, display name, exact public username, and recent public-video metadata,
> and stores encrypted refreshable credentials. Display API media appears in
> the matching creator's TikTok rail and opens in CORE TV's player. Disconnect
> removes the stored connection and derived data. We do not request publishing,
> comment, direct-message, watch-history, or statistics permissions.

## Sandbox and review recording

First-time review must demonstrate the integration in a TikTok Sandbox:

1. Create or clone a Sandbox for the app.
2. Add Login Kit and TikTok API / Display API with the three scopes above.
3. Add an owned TikTok account as a target user. TikTok permits up to 10 target
   users per Sandbox; each owner must complete TikTok's own login and consent.
4. Use an HTTPS deployment whose domain matches the configured Web URL. A local
   HTTP development server is not a valid TikTok Web redirect.
5. Record the complete, current flow on that domain:
   - open the public home page and show visible Privacy and Terms links;
   - sign in to a CORE account and open `/account`;
   - select Connect on the TikTok row;
   - show TikTok's consent screen and all three requested scopes;
   - approve, return to `/account`, and show the connected exact `@username`;
   - open the matching `/channels/<member>` page;
   - show recent TikTok thumbnails and open one in the custom player;
   - disconnect the account and show the connection is removed.
6. Upload at least one complete demo video (maximum five, each at most 50 MB)
   and explain every selected product and scope in the review form.
7. Remove any unused product or scope before submission, import the tested
   Sandbox configuration into the Production Draft, save, and submit.

Do not submit until the site is production-ready. TikTok's review guidelines
state that unfinished/testing-only sites and private/personal-use apps are not
approved.

## Runtime configuration and persistence

Production needs server-only values:

```dotenv
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
DATABASE_URL=
FAN_OAUTH_KEY=
```

`FAN_SESSION_SECRET` may derive the encryption key when a dedicated
`FAN_OAUTH_KEY` is not set, but a separate 32+ character key is preferred.
Never expose any of these values through `NEXT_PUBLIC_*` variables or commit
them.

The flow is implemented at:

- start: `/api/oauth/tiktok/start`
- callback: `/api/oauth/tiktok/callback`
- disconnect: `DELETE /api/oauth/tiktok`

Each creator signs into a CORE account and authorizes the corresponding TikTok
account. `fan_oauth_connections` stores one encrypted TikTok connection per
CORE user, including the app-scoped TikTok user ID, exact username, granted
scopes, encrypted access/refresh tokens, expiration, and sync state. Public
channel ingestion looks up an active grant by normalized exact username and
requires `video.list`; credentials never reach the browser.

The seven expected grants are:

- `@officialcoreboys`
- `@marlon3lg`
- `@lacy`
- `@yungsilk`
- `@fazeadapt`
- `@realstableronaldo`
- `@jasontheween`

After each authorization, run the token-safe readiness check:

```bash
pnpm social:check -- --strict
```

TikTok is ready only when it reports `oauthApp: true` and `ready: 7`.

## Official references

- [Register an app](https://developers.tiktok.com/docs/en/getting-started-create-an-app)
- [Login Kit for Web](https://developers.tiktok.com/doc/login-kit-web)
- [Display API get started](https://developers.tiktok.com/docs/en/display-api-get-started)
- [Scopes](https://developers.tiktok.com/docs/en/scopes-overview)
- [User access-token management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management)
- [Sandbox setup](https://developers.tiktok.com/doc/add-a-sandbox)
- [App review guidelines](https://developers.tiktok.com/doc/app-review-guidelines)
