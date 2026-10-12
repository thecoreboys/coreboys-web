# Creator tags

Creator tags are an enhancement included with CORE Membership (`player.creator_tags`).
Signed-out, Free, expired and unavailable membership states cannot read the
tags, search or suggestion APIs. Responses are private and never browser/CDN cached;
the source's reviewed tag data uses the existing shared Redis cache behind this gate.
Public playback remains free.

Complimentary account access can be granted without starting or changing a
subscription. The server reads the latest administrative
`feature_entitlement_granted` / `feature_entitlement_revoked` event for
`player.creator_tags` from the existing append-only subscription ledger.
`expiresAt` may be null or a future ISO timestamp. Revocation, expiry and invalid
expiry values fail closed. The grant applies only to this enhancement and does
not enable metered AI utilities or modify Stripe contracts.

The player's **On screen** panel opens automatically on hover or keyboard focus;
tap its header to keep it open. It sits at the top left and lists confirmed
creators at the current playback time with profile pictures and direct social
links. Its size and scrolling stay within the player, including multiview tiles.
An empty moment is labeled explicitly, rather than filling the panel with names
from a title or caption. **Find a creator** opens the optional directory search.

The six CORE
members and Adin Ross, PlaqueBoyMax and YourRAGE have initial verified profile
links. Administrators can add other creators and update aliases or social links
at `/admin/media-intelligence`.

Scheduled media-intelligence maintenance matches titles and approved captions
against this directory. Each match becomes a draft review candidate. A name
mentioned in a title or caption never automatically becomes an on-screen tag.
Admins confirm the moment, optionally provide a normalized placement, then
publish. Source revision changes, deleted assets, expired or revoked captions,
and hidden creators exclude related tags from public reads. Public snapshots
load automatically for eligible accounts, then refresh every 15 seconds while the
page is visible. Names appear on hover, keyboard focus or touch. Playback time chooses
which tags to show without issuing a request on each video frame.

The protected creator-maintenance stage refreshes public Twitch and Kick profile
images in bounded batches, at most once per account per day. It reads profile
metadata only, does not run in a viewer request and preserves curated image
overrides. Failed providers retain known pictures; failed image loads show
initials. Profile updates do not cause the text scanner to rescan every video.

Viewers can select a rectangle on the video, choose a known name or username,
and suggest a five-second placement for review. This also works on YouTube and
Twitch embeds: the rectangle only records coordinates, without reading iframe
pixels. No image is captured or uploaded, and no facial identity is inferred.
Directory matches always use the current verified profiles. Tags cannot appear
until an administrator confirms and publishes them.

Twitch's live SDK reports viewer watch time rather than a broadcast frame
timestamp. Live profile lookup remains available, but positioned timed tags are
suppressed until replay/DVR playback provides a real video timeline. YouTube
live and VOD players use their reported media timeline. No guessed live clock
is used to place a creator name over the wrong frame.

Paid image transcription has been removed. The search endpoint accepts text
only and rejects image payloads, even when Azure credentials are configured.
The feature cannot invoke an AI model or incur model charges. Existing hosting,
database and cache infrastructure still have their normal operating costs.
No facial recognition, reusable face database or model training is implemented.

Apply media migration `055_creator_tags.sql` and primary migration
`054_azure_creator_text.sql` before deploying. The normal Azure workflow applies
both. The protected cron adds a `creators` stage and supports the same action at
`/api/media-intelligence/catalog-sync` for a bounded manual run.
