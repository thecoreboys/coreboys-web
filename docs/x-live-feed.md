# CORE and crew X updates

The backend collects CORE-member and behind-the-camera crew posts into one
durable X snapshot. Crew accounts come from the canonical `CREW` roster, with
`crew:<slug>` identities; a crew member's post is never attributed to the
creator they work with. The separate home-page feeds and individual crew
notification controls are a companion UI change. This activation release
only changes the receiver, scheduled recovery, and snapshot storage.

## Delivery modes

- **Scheduled API refresh:** the existing Azure job calls
  `POST /api/social/x/refresh` every five minutes; the GitHub schedule is a
  fallback. The shared database lock prevents duplicate provider requests.
  Browser refreshes only read saved posts, so visitor traffic does not cause
  paid X requests. This is automatic, near-live polling, not instantaneous
  delivery.
- **X Activity webhook (recommended):** `GET/POST /api/social/webhooks/x`
  receives signed `post.create` deliveries, saves them immediately, and
  creates idempotent notification records. Configure one subscription per
  public roster account. This is the self-serve option; merely deploying the
  endpoint does not activate provider subscriptions.
- **Filtered-stream webhook:** the same receiver also supports X's original
  v2 filtered-stream payload. That delivery product requires Enterprise
  eligibility; it is not required for the Activity approach above.

The polling job remains a recovery path when stream delivery is interrupted.
It has a separate cursor, so a streamed post cannot cause another account's
unseen post to be skipped. When a recent-search window contains more than 100
posts, the next scheduled run resumes its saved pagination token with the
original lower boundary. The completed cursor advances only after the final
page is stored, and the feed shows a catching-up state while pages remain.
Each page stays inside the existing per-run budget reservation. A change to the configured account list resets the
next scheduled search to its initial recent window. Historical imports remain
the explicit Social Fetch backfill; stale imports do not generate fresh alerts.

## Configure the scheduled reader

Retain the existing `X_BEARER_TOKEN`, `METRICS_CRON_SECRET`,
`X_API_MONTHLY_CEILING_USD`, `X_API_CREDIT_BALANCE_USD`,
`X_API_READ_POST_UNIT_USD`, and `X_API_READ_USER_UNIT_USD` settings. The budget
gate and last-good snapshot remain in effect if X is unavailable or the budget
is exhausted. Provider credentials and budget diagnostics never enter the
public feed response.

`X_FEED_REFRESH_MINUTES` defaults to `5` and accepts `1` through `1440`.
Changing it only changes the server's minimum interval; it does not create a
faster scheduler. For a one-minute polling deployment, set this variable to
`1` and configure the **Azure** X job to `* * * * *`. Keep the existing GitHub
five-minute fallback and the shared database lock. Do not increase cadence
without checking the configured provider budget. No cadence or paid account
settings are changed automatically by this feature.

## Enable X Activity delivery

[X Activity](https://docs.x.com/x-api/activity/introduction) supports self-serve
`post.create` subscriptions for public users. Its documented price is
[$0.005 per event](https://docs.x.com/x-api/activity/event-pricing), with subscription
limits documented by X. Confirm the account's current pricing and spending
limit before activation. The scheduled reader remains an independent fallback.

1. Resolve each configured handle from `configuredXFeedAccounts()` to its X
   numeric user ID. This includes CORE, all six creators, and every crew member
   with an X account. IDs may be read from existing subscriptions created in
   the developer console with no webhook attached. Do not guess IDs or
   subscribe an account that is absent from the roster.
2. Set the GitHub repository variable `X_ACTIVITY_ACCOUNT_BINDINGS` to a JSON
   object mapping each verified numeric ID to its canonical owner, for example
   `{"123456789":"core","987654321":"crew:drew-wall"}`. The owner is `core`,
   a creator slug such as `adapt`, or a namespaced crew slug. Each owner may
   appear once and must exist in the configured roster. These IDs are public
   configuration, not credentials. The Azure workflow forwards this variable
   to the application on every deployment, defaulting to `{}` when absent.
3. Configure `X_CLIENT_SECRET` with the app's OAuth 2.0 client secret. Existing
   OAuth 1.0-only integrations can use `X_API_SECRET` (consumer secret). These
   settings are already supported by the Azure deployment. The bearer token
   is **not** the signing secret.
4. Deploy the callback at
   `https://thecoreboys.com/api/social/webhooks/x` and register it using
   `POST /2/webhooks`. The callback responds to
   X's `crc_token` challenge and verifies the raw-body HMAC signature on every
   delivery. It prefers `X-Twitter-Webhooks-Signature-OAuth2`; if that header is
   present but invalid, it does not fall back to a weaker path. Legacy apps
   use `X-Twitter-Webhooks-Signature`.
5. In the developer console's Event subscriptions screen, select Post →
   Post Create, supply the user ID, and choose the registered webhook.
   The equivalent API request is `POST /2/activity/subscriptions` with
   `event_type: "post.create"`, `filter: { user_id: "..." }`, and `webhook_id`.
   Preserve existing subscriptions and reuse an identical subscription rather
   than adding duplicates. The receiver accepts the documented
   [Activity envelope](https://docs.x.com/x-api/activity/event-payloads):
   `data.event_type`, `data.payload`, `data.includes`, and `data.filter`.
   X may omit `includes.users`. In that case the post's `author_id` must match
   the subscription's `filter.user_id` and an explicitly configured ID binding.
   The receiver uses the roster's canonical handle/name without inventing an
   avatar or verification status. A supplied author expansion must agree with
   its binding, and tags are never accepted as proof of identity. Replies and
   reposts are excluded by the receiver.
6. Verify CRC success and one signed delivery. Expect a `200` acknowledgement
   only after the post and notification records persist. A `503` requests a
   provider retry; duplicate statuses and media attachments retain one
   canonical notification identity. Outbound push/email drains separately
   from the acknowledgement, using the existing durable queue and opt-ins.

Follow X's [webhook security guide](https://docs.x.com/x-api/webhooks/quickstart)
and [Activity guide](https://docs.x.com/x-api/activity/introduction)
for current provider setup. Registration and event billing are provider-side
operations; the application's outgoing-request budget gate cannot stop costs
for independently configured push subscriptions. Set provider-side limits
when enabling them. For an Enterprise filtered-stream integration, retain its
existing rules and use the separate [stream linkage guide](https://docs.x.com/x-api/webhooks/stream/quickstart);
do not enable both delivery products for the same accounts unnecessarily.

## Freshness and validation

A successful API sweep reports full-roster freshness. A single streamed event
updates its delivery timestamp without pretending every other account was
refreshed. The home page omits empty audiences, including their headings and
connection toolbar, while background recovery continues. Available saved
posts remain visible with a quiet "Saved posts" status during an outage or
refresh delay. Only a fresh successful response shows automatic updates;
operator diagnostics retain the underlying availability and failure state.

Run `pnpm exec tsx --test tests/x-crew-roster.test.ts tests/x-webhook.test.ts tests/x-webhook-route.test.ts tests/x-live-snapshot.test.ts tests/x-feed-pagination.test.ts`
for roster attribution, duplicate-media event identity, signature tampering,
CRC, body-size limits, malformed deliveries, missing-author bindings, identity
conflicts, and non-roster/reply filtering.
The snapshot suite covers concurrent writes and polling cursor recovery.

No external webhook, paid fetch, scheduler change, or deployment is performed
by these local tests.
