# Automated postcard (print & mail) — setup

Fans design a postcard at **`/fan-mail/postcard`**, pay with Stripe, and the
backend prints + mails it to the chosen member's PO box via **Lob**.

Flow: customize → `POST /api/postcard/create-intent` (validate every draft
field and image source, normalize media, moderate copy, freeze front/back
HTML, price, and persist) → Stripe Elements (on-site) →
`POST /api/postcard/webhook` (`payment_intent.succeeded`) → human review when
custom art is present → fulfil via Lob → frontend polls
`GET /api/postcard/status`.

The status endpoint requires a random per-order token that is returned only
to that browser and stored as a one-way hash. Test-proof URLs are never
available from a bare order id.

## Runs with zero config (sandbox)

With **no keys set**, the whole flow is demoable as a local simulation. It
does not call Lob, charge a card, print anything, or create mail. The UI shows
a "Sandbox mode" badge on the success screen.

## Go live — environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (already used elsewhere). Table `postcard_orders` is auto-created. |
| `STRIPE_SECRET_KEY` | Stripe server key (`sk_test_…` / `sk_live_…`). |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_test_…` / `pk_live_…`). |
| `STRIPE_WEBHOOK_SECRET` | From the Stripe webhook endpoint (`whsec_…`). |
| `LOB_API_KEY` | Lob key. `test_…` → real digital proofs, no print/charge. `live_…` → prints + mails. |
| `LOB_SCHEDULED_MAIL_ENABLED` | Set to `true` only after the Lob account is approved for scheduled sends. Otherwise requested mailing dates fail closed. |
| `LOB_RETURN_NAME`, `LOB_RETURN_LINE1`, `LOB_RETURN_CITY`, `LOB_RETURN_STATE`, `LOB_RETURN_ZIP` | Dedicated, authorized default return address. `LOB_RETURN_LINE2` is optional. A fan may instead provide a complete return address per order. |
| `ANTHROPIC_API_KEY` | *(optional)* enables a second, LLM moderation pass. |

The mode is fail-closed: either all four postcard-provider values are absent
(local sandbox), all Stripe keys are test keys plus a `whsec_…` secret and a
Lob `test_…` key, or all Stripe keys are live plus a `whsec_…` secret and a
Lob `live_…` key. Partial or mixed configuration disables checkout. A live
Lob request can only follow a signature-verified, matching live payment.
Test mode ends in an explicit proof-only status; it never claims that USPS
received a physical postcard.

## Database migrations

Apply the additive web migrations before enabling live checkout:

```powershell
pnpm exec node scripts/apply-web-migrations.mjs
```

The postcard product needs migrations `017`, `021`, and `022` in order. They
add member design packs and review workflows, immutable rich-draft checkout
snapshots, and truthful collectible releases/issuance/binder records. Routes
fail closed or fall back to the ordinary postcard catalog while those tables
are unavailable; they never invent a serial or scarcity label.

The exact front/back HTML and a SHA-256 hash are frozen before payment. Lob
always receives that verified snapshot, so a later deployment cannot alter a
paid card. Provider timeouts return the order to a retryable state and reuse
the order id as Lob's idempotency key.

## Stripe webhook

Add an endpoint in the Stripe dashboard → `{SITE_URL}/api/postcard/webhook`,
subscribe to **`payment_intent.succeeded`**, copy the signing secret into
`STRIPE_WEBHOOK_SECRET`. Locally: `stripe listen --forward-to
localhost:3005/api/postcard/webhook`.

## Pricing (`lib/postcard.ts`)

`$3.00` text-only, `$4.50` with custom art. Lob runs ~`$0.75–0.90`/piece, so
the margin is the spread. Change `PRICING` to adjust.

## Notes / production upgrades

- **Destination is never user-typed** — resolved from `MAIL_MEMBERS` by slug.
- **Fan art** is decoded, bounded, metadata-stripped, and normalized again on
  the server before it enters the order snapshot. Client-supplied remote URLs,
  SVG, and unrecognized managed assets are rejected. Authorized CORE moments
  and member-pack assets are re-resolved from opaque IDs; submitted preview
  URLs are ignored.
  After Stripe confirms payment, every custom-art order enters the protected
  **Admin → Postcard review** queue. An admin must approve it before Lob is
  called; declining it issues an idempotent full Stripe refund. Text-only
  orders do not require this visual-review step.
  The browser keeps unfinished image-heavy drafts in IndexedDB. A future
  object-storage path can replace embedded checkout media with trusted,
  immutable asset references without changing the draft contract.
- **Moderation**: local profanity/spam (`bad-words`) always on; optional LLM
  pass via `ANTHROPIC_API_KEY` (fails open).
- **Collectibles**: only signed-in fans may choose a currently approved live
  release. The browser chooses a real variant, never a random paid outcome;
  checkout creates a 30-minute capacity hold and Stripe confirmation converts
  it to a permanent reservation before Lob can receive the card. Failed and
  refunded orders release the hold. The database alone allocates serials
  after a live print is accepted, including paid reservations whose public
  release window closed during art review. Binder reads at
  `/binder/postcards` are private and account-filtered. Sandbox and test
  orders cannot reserve or issue collectible inventory.
- **Provider** is behind `lib/print-mail.ts` (`sendPostcard`) — swap Lob for
  PostGrid/Stannp there without touching routes or UI.
- Real-time order state uses token-authenticated polling on
  `/api/postcard/status` (simple + robust);
  WebSockets can replace it later if desired.
