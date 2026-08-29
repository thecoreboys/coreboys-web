# Resend email delivery

Transactional notification email uses Resend with the verified sender domain
`thecoreboys.com`. The server defaults to:

- sender name: `The CORE Boys`
- sender address: `notifications@thecoreboys.com`
- delivery: disabled

No browser bundle receives the Resend API key. Delivery remains inert unless
the domain is verified, the server has a key, and
`EMAIL_NOTIFICATIONS_ENABLED=true` is set explicitly.

## Environment

```dotenv
RESEND_API_KEY=
RESEND_FROM_EMAIL=notifications@thecoreboys.com
RESEND_FROM_NAME=The CORE Boys
RESEND_REPLY_TO_EMAIL=
EMAIL_NOTIFICATIONS_ENABLED=false
```

`RESEND_FROM_EMAIL` is intentionally restricted to `@thecoreboys.com`.
`RESEND_REPLY_TO_EMAIL` is optional and should only be set to a monitored
mailbox.

## Domain verification

Add `thecoreboys.com` in Resend, then copy the exact DKIM and SPF records shown
for that domain into its authoritative Cloudflare DNS zone. Resend generates
the DKIM value and may select a region-specific return-path value, so never use
values copied from another domain or documentation example. Keep mail-related
DNS records set to **DNS only**, not proxied. A DMARC record is recommended once
the sending domain is verified.

Do not enable delivery until Resend reports every required record as verified.
Rotating a leaked API key does not require DNS changes.

## Fan email verification

New fan accounts receive a one-time verification link when mail delivery is
ready. Signed-in fans can request another link from account notification
settings. Only a SHA-256 token hash is stored, links expire after 60 minutes,
and requests are rate-limited. Social email alerts remain unavailable until
the link has marked `fan_users.email_verified=true`.

## Consent and dispatch

The social notification worker delivers opted-in creator events directly. The
separate `drainResendFanNotificationOutbox()` bridge for legacy FanZone events
still has no automatic worker and leaves those records untouched. Before any
network request, either provider path requires both:

1. a verified account email, and
2. `email_enabled = true` for the event category in
   `fan_notification_channel_preferences`.

Moderation events map to the `community` category. Push stays unavailable, and
SMS requires a separate provider and verified phone-number flow.
