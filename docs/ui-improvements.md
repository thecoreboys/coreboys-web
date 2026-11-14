# Viewing and browsing improvements

Implemented locally from the site audit. No deployment is included.

## Loading and page structure

- Home sends a smaller, balanced catalogue and lets Originals and Patreon load separately.
- Creator pages start with current content. Photos and historical airtime are requested only when their section opens.
- Creator galleries render 24 unique photos at a time instead of duplicated animated rows. The full-size viewer remains available.
- Video, clip, photo, and timeline collections use smaller initial batches.
- Bundled artwork uses responsive image optimization. Provider-owned and signed image URLs retain their existing handling.
- Radio audio and video previews wait for an intentional action. Only one hover preview remains active.
- Saved-library access is checked before loading its catalogue.

## Appearance and usability

- Removed the grain, scanline, custom cursor, promotional overlay, and routine alert clutter from the site shell.
- Increased card text and control sizes; simplified borders, movement, navigation, footer, and fan-site notice.
- Cleaned displayed titles while retaining original source titles and links.
- Added clearer content-type labels, recent-content rules, duration/category details, and alternate-platform links for matching cross-posts.
- Added a full archive-search page with creator, platform, type, and date filters. Search, Videos, and Clips retain filters in the URL.
- Creator tabs separate Latest, Guide and history, Photos, Posts, and About and fan mail.
- Originals use ordered episodes, available artwork, a shared player, and Start/Resume actions.
- Shorts preserve the current item and offer an explicit skip path when a provider cannot play. Secondary creator details are collapsed.
- Clips use the shared player so audio ownership is consistent with radio and other videos.
- Account settings use focused sections. Connected accounts explain capabilities and preserve sync/reconnect controls.
- Notifications group repeated creator updates without merging unrelated notices.
- Replaced speculative AI-search and design-brief copy in photos, community, and fan-mail surfaces.
- Timeline entries come from actual published catalogue items and include creator/year filtering.
- Clarified saved-library terminology, unknown airtime coverage, unavailable services, and source-platform fallback messages.

## Scope and verification limits

Shared layout and typography changes apply across public pages. Existing guide timezones, multiview layouts/audio ownership, notification frequency controls, profile visibility, collection rules, and administrative coverage indicators were retained where already functional.

Provider restrictions still apply: a private, unavailable, or blocked Twitch, YouTube, TikTok, Instagram, X, or Patreon item cannot be made playable by a site layout change. The UI distinguishes available actions and provides the original destination. Connection permissions and paid access remain enforced.

Local browser review covers desktop/mobile layout, creator tabs and galleries, search, and representative viewing flows. It is not an end-to-end test of every signed-in account, paid entitlement, provider login, or billing transaction. Production speed must be measured after deployment; local development compilation is not a production performance measurement.

## Observed results

- The reviewed Jason creator page starts with 58 images and 81 buttons, compared with 509 images and more than 1,000 buttons in the audit. These are rendered-element counts, not a claimed percentage improvement in load time.
- Its Photos tab renders 24 unique photos; the full-size viewer opens and closes correctly.
- The reviewed home load made no station-audio or provider-iframe requests before playback was requested.
- Mobile home controls fit at 390 pixels wide without the carousel covering the Play action.
- Search filters survive a production-preview reload, and an unmatched query shows a clear empty result.
- An empty Originals collection displays its unavailable state without a misleading Play button.
- Fixed-snapshot `pnpm test`: 1,051 passed, two database-related checks skipped, zero failures. The earlier workspace run also passed the database-mirror check that requires the sibling private repository.
