# Creator social refresh

Public creator media has no dependency on viewer OAuth. The public feed reads
only the fixed CORE roster plus server-side creator token maps. A fan who
connects TikTok, Instagram, or X from their account page can use personal
features, but their account is never eligible to appear in the public feed.

## TikTok and Instagram

Add one server-only token entry for each configured creator handle. Do not put
these values in `NEXT_PUBLIC_*` variables, browser code, source control, or a
viewer OAuth record.

```env
# Include openId/userId when signed post webhooks are enabled.
TIKTOK_ACCOUNT_TOKENS_JSON={"officialcoreboys":{"accessToken":"...","openId":"..."},"marlon3lg":{"accessToken":"...","openId":"..."}}
INSTAGRAM_ACCOUNT_TOKENS_JSON={"createownruneverything":{"accessToken":"...","userId":"...","api":"instagram"},"marlon3lg":{"accessToken":"...","userId":"...","api":"instagram"}}
```

The required handles are visible without exposing secrets:

```bash
pnpm social:check
```

TikTok and Instagram are reconciled every ten minutes by
`.github/workflows/cron-social-events.yml`. The job pulls the latest bounded
window, records new post IDs idempotently, refreshes the public cache, and
delivers any enabled notifications. TikTok Display API requires an initial
creator-authorized `video.list` grant; Instagram requires a professional
account access token. Those are provider requirements, not a reason to use a
fan's OAuth connection as a creator source.

## X

X uses the app bearer token and one shared roster snapshot refresh every 15
minutes. It is not tied to viewer OAuth. The GitHub Actions secret
`METRICS_APP_URL` must point to the active deployed application—not a removed
Vercel deployment—and `METRICS_CRON_SECRET` must match the app environment.

```bash
pnpm social:check -- --strict
```

The audit reports an X snapshot older than 24 hours as stale in production.
It also confirms that all seven roster handles are mapped, without displaying
credentials.
