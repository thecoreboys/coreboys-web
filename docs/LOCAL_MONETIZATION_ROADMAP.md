# Local monetization roadmap

Status: approved for local product development on August 20, 2026. Nothing in
this document authorizes deployment, a live checkout, or a charge.

## Product boundary

The free product always includes access to every public creator/platform embed,
basic Watch and Guide browsing, basic search, basic My List, playback controls,
accessibility controls, account security, privacy controls, and legally required
data export/deletion. A paid plan buys original software utility only.

Paid-plan screens must use neutral plan names and may not use a creator name,
face, logo, catchphrase, or implied endorsement. They must show this disclosure:

> Independent fan-made software. Not affiliated with, endorsed by, sponsored by,
> or operated by the featured creators or platforms. Payment is for original
> software features, not access to creator content. No payment goes to featured
> creators unless expressly stated.

## Approved entitlement catalog

### Cloud organization and personalization

- `A01` Cross-device Continue Watching synchronization.
- `A02` Extended personal viewing-history retention.
- `A03` Cloud-synced playback and preview preferences.
- `A04` Cloud-synced My List with conflict-safe merge.
- `A05` Multiple custom lists.
- `A06` List folders and manual ordering.
- `A07` Private notes on saved items.
- `A08` Private user-authored tags.
- `A09` Advanced watched, unwatched, progress, format, platform, and member filters.
- `A10` Manual watched/unwatched correction.
- `A11` Viewing-insights CSV/JSON export. Privacy/account export remains free.
- `A12` Personal viewing dashboard and trends.
- `A13` Multiple household profiles.
- `A14` Guest profile with isolated history.
- `A15` Playback handoff between signed-in devices.
- `A16` Profile PIN and profile-level preferences.
- `A17` Cloud queue synchronization.
- `A18` Reusable queue and channel templates.

### Notifications and automation

- `A19` More simultaneous creator go-live alerts.
- `A20` Premiere and scheduled-broadcast reminders.
- `A21` Keyword, title, topic, and format alerts.
- `A22` Fine-grained per-member alert rules.
- `A23` Quiet hours in the viewer's browser timezone.
- `A24` Daily, weekly, or custom digest schedules.
- `A25` Per-platform notification rules.
- `A26` Smart duplicate-alert suppression.
- `A27` Personal calendar feed/export for saved programs.
- `A28` Personal webhook or private RSS automation feed.
- `A29` Personalized email recap.
- `A30` Text-message delivery as a metered add-on after verified consent.
- `A31` Push preferences and delivery when the product marks it ready.
- `A32` Reminder snooze, escalation, and missed-show recap.

### Original viewing utilities

- `A33` Expanded multiview capacity; individual playback remains free.
- `A34` Saved multiview layouts.
- `A35` User-configurable merged-chat layouts.
- `A36` Local synchronized playback controls where providers permit them.
- `A37` Private watch rooms and shared queues.
- `A38` Advanced picture-in-picture and compact-player preferences.
- `A39` Persistent mini-player layouts.
- `A40` Advanced bandwidth and preview-autoplay policies.
- `A41` Saved caption, size, contrast, and audio-description presets. The underlying
  accessibility controls remain free.
- `A42` Custom keyboard and TV-remote shortcut profiles.
- `A43` Local audio-level preferences where browser/provider APIs permit them.
- `A44` Personal A/B loop and repeat controls without downloading media.
- `A45` Private timestamp bookmarks.
- `A46` AI-assisted chapter and moment navigation from the local index.
- `A47` Personal watch-time and completion analytics.
- `A48` Private monthly/yearly viewing recaps.
- `A49` Optional personal goals and streaks with no creator-affiliation claim.

### AI discovery and search

- `A50` Generous basic title, creator, platform, format, and prefix search for everyone.
- `A51` Unlimited semantic/conversational search.
- `A52` Advanced concept, alias, and intent matching.
- `A53` Search inside a member, platform, format, or date range.
- `A54` Searchable moments and chapters from one-time analysis.
- `A55` Saved searches and pinned queries.
- `A56` User-defined nonstop smart channels.
- `A57` Personalized cross-platform recommendations.
- `A58` Recommendation controls and adjustable taste weights.
- `A59` Topic, phrase, member, and format suppression rules.
- `A60` User-controlled content-warning and sensitivity filters.
- `A61` Personalized daily and nightly lineups.
- `A62` Clear “why this matched/recommended” explanations.
- `A63` Similar-content browsing from locally stored embeddings.
- `A64` Private automatic organization tags.
- `A65` Semantic search across a user's own notes and lists.
- `A66` Priority analysis of user-authorized sources within provider rules.

### Community and customization

- `A67` Private rooms for invited users.
- `A68` Room roles and original moderation tools.
- `A69` Shared collaborative lists and queues.
- `A70` User-created polls and room prompts unrelated to creator endorsement.
- `A71` Neutral interface theme packs and layout customization.
- `A72` A neutral software-supporter account badge, never a creator badge.

## Local plan model

| Plan | Local target | Intended software value |
| --- | ---: | --- |
| Free | $0 | Public viewing, Guide, basic search, one My List, accessibility/privacy essentials |
| Plus | $5/month | Sync, longer history, advanced lists, alerts, saved search, personalization |
| Pro | $7/month | Expanded multiview, smart channels, rooms, unlimited AI discovery, automation |
| Local lifetime | $49 once | Local-first Plus/Pro utility without hosted delivery costs; exact limits TBD |
| Authorized Business | $49–149/month | Tools only for a content owner who has authorized their own sources |

AI, text-message, and unusually heavy hosted usage should use transparent metered
add-ons rather than forcing all customers to subsidize it. The local deterministic
embedding/search system stays the default during development, so no paid Foundry
calls happen per search or per user.

## Implementation phases

1. Local plan definitions, entitlements, server checks, development-only plan
   switching, upgrade page, account plan status, and reusable lock UI.
2. A01–A18: sync, lists, history, profiles, and queue organization.
3. A19–A32: notification rules; keep all delivery kill switches off locally.
4. A33–A49: viewing utilities and private rooms without gating source playback.
5. A50–A66: one-time analysis, semantic search, personalization, and usage budgets.
6. A67–A72: collaboration, neutral customization, and supporter identity.
7. Only after legal/platform review: payment-provider test mode, webhook ledger,
   cancellation, invoices, consent receipts, renewals, and production rollout.

## Explicit partnership hold

Do not implement or sell creator-branded tiers, creator imagery in checkout,
exclusive/paywalled creator content, tipping on a creator's behalf, downloads or
restreaming, creator AI voice/likeness, sponsor overlays on provider players,
paid placement, “official” badges, creator-specific commercial analytics, branded
giveaways, or claims that revenue supports a creator. These require written
creator/management authorization and any applicable platform permission.
