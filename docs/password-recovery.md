# Password recovery

The sign-in dialog includes **Forgot password?**, preserves the entered email
and return destination, and supports sending/resending reset links. A direct
`/forgot-password` visit opens the same dialog. `/reset-password` validates the
email link, asks for the new password twice, and returns to sign in after success.

Links expire after 30 minutes and can be used once. New requests supersede older
links, with a 60-second resend cooldown and shared IP/account throttles. The
account lookup and email delivery run after the generic acceptance response to
avoid revealing registered addresses. Mail configuration outages return an
actionable error before accepting the request.

Tokens are generated with 32 random bytes. PostgreSQL stores only SHA-256 hashes;
the email URL carries its secret in a fragment, which the form removes on mount.
The reset page disables analytics, indexing, caching, and referrer transmission. Completing
a reset atomically consumes outstanding links, hashes the password with bcrypt,
and increments the account's session version to revoke existing sessions.
Existing sessions without a version remain valid at version zero until a reset.

## Deployment

Run `pnpm db:apply-web-migrations` **before rolling out the application**. Migration
`067_fan_password_reset.sql` adds the token table and `fan_users.session_version`.
It is additive and idempotent; the existing deployment workflow already runs the
migration step before rollout.

Recovery uses the existing Resend transport. Set `RESEND_API_KEY`,
`EMAIL_NOTIFICATIONS_ENABLED=true`, and `NEXT_PUBLIC_SITE_URL` to the public HTTPS
origin. The sender defaults to `The CORE Boys <notifications@thecoreboys.com>`;
the sender domain must be verified in Resend. Recovery is a user-requested account
email and does not require notification subscriptions or a verified email flag.
Exact reset routes remain accessible through the preview gate so an emailed link
works on another device; they still require a valid reset token.

## Verification

`pnpm test` includes validation, route behavior, and error handling. To also test
transactions, concurrent consumption, rollback, expiry, resend, provider failures,
and session revocation against an isolated PostgreSQL database, set
`PASSWORD_RESET_TEST_DATABASE_URL` to a loopback database named exactly
`coreboys_password_reset_test`, then run:

```sh
pnpm exec tsx --test tests/password-reset.test.ts
```

The integration tests truncate their own test tables and mock the email provider.
They reject remote database hosts and other database names.
