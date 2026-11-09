# CORE design and functionality audit

Reviewed November 8, 2026 (America/New_York). Local preview: http://127.0.0.1:3015/. This is a local implementation and verification report, not a production deployment sign-off.

## Result

The homepage starts directly with its full-width Netflix-style billboard. Inner pages use a consistent Inter type scale, generous spacing, restrained rose/peach gradients, subtle curved-line patterns, rounded cards, and clear pill actions. A generated smoked-glass background is used on selected membership and CTA surfaces. Media players retain their own layout.

The route inventory below covers every page file found in the app. Shared components and route families were reviewed in source; representative public pages and interactions were checked in the browser. It does not mean every dynamic content record or authenticated transaction was exercised.

## Design coverage

| Family | Treatment |
| --- | --- |
| Homepage | Full-width cinematic hero; rounded shelves; readable titles; quieter library callout; atmospheric support showcase |
| Clips, Media, Fanzone, News, Logo submissions | Shared premium page header and action layout |
| Search, Timeline, Videos, Metrics | Migrated custom headers to the shared page header |
| Guide | Ambient intro, larger controls, contained timeline, readable notes |
| Networks and creator channels | Larger navigation targets, flexible tablet columns, calmer heading scale and pill mode controls |
| Crew profiles and Links | Coordinated title treatment, softer corners, readable metadata and social controls |
| Membership and billing surfaces | Theme-aware pricing cards, larger amount controls and readable details; existing billing logic preserved |
| Account settings and Studio | Shared title band, rounded practical navigation/toolbars |
| Fan mail | Coordinated intro and spacing; existing postal artwork and public-address controls preserved |
| Legal documents | Ambient title bands, rounded reading surface, readable body text and scrolling document navigation |
| Theater, Shorts, Multiview, private tools | Shared navigation/control styling; functional media geometry retained |

## Browser verification

Viewports checked across representative pages: 1440×1000 desktop, 1024×900 tablet, 768×700 tablet forms, 390×844 phone, and 320×700 narrow phone. Dark and light appearances were checked. Horizontal content shelves, data tables, and the Guide timeline intentionally scroll inside their own regions; the checked pages did not overflow the document horizontally.

| Area | Verified interaction or layout |
| --- | --- |
| Homepage | Full-bleed hero, previous/next selected feature, phone layout, lower content shelves and CTA artwork |
| Navigation | Desktop and phone navigation, mobile menu, sign-in entry, theme switching |
| Clips | Desktop/phone filter layout and honest local-draft entry label |
| Media | Creator filter, grid/table switch, photo viewer, Tab wrap in both directions, close and focus restoration |
| Fanzone | Phone sections and submission dialog entry/cancel; no upload or agreement submitted |
| Fan mail | Phone layout and successful copy-address feedback |
| Privacy policy | Phone reading surface and contained legal navigation |
| Upgrade | Desktop and phone title/pricing layout; billing actions not executed |
| Guide | Phone Now & next, filter disclosure, full timeline, selected Twitch filter, tablet layout; timeline stayed inside its scroll region |
| CORE channel | 1024px columns and phone layout; all seven phone network links measured 44×44px; Photos tab loaded its empty state and archive link |
| Search | Query and platform changed the URL; real results returned; 48px controls with 16px input text; narrow-phone containment |
| Playback | Search result opened the shared player; real YouTube progress advanced; Pause changed to Play; phone sidebar closed correctly; Stop closed playback and returned to Search |
| Authentication | Light-page/dark-dialog contrast, visible focus targets, keyboard containment, Escape dismissal, narrow-phone form and tablet signup layout |

## Functional corrections

- Clip preparation previously saved only in local storage but reported that staff would review it. It now explicitly saves a browser-local draft, uses a separate draft store, reports storage failures, waits for account checks, and validates actual provider hosts. Public clip submission is still unavailable. Member labels are visible on touch screens and terms use the existing accessible dialog.
- Sign-in focus order excludes the hidden desktop showcase. Tab wraps and recovers focus, closing restores previous focus, and tablet forms remain a single column until there is room for the showcase. Dots and close controls have comfortable targets. Labels and helper text remain readable when the surrounding page is light.
- Photo viewers have an accessible name, keyboard containment, focus restoration, body scroll locking, and a larger close target.
- Channel hero columns no longer impose conflicting minimum widths at tablet sizes. Phone network controls are 44px, and the CORE wordmark remains visible when text labels collapse.
- Theater's unavailable-content message follows the active theme.
- Older source-contract tests were aligned with the current explicit-Play hero and the shared navigation-minimize handler. The tests continue checking the actual playback handoff behavior.

## Automated checks

- Full suite: **1,146 passed, 0 failed, 1 skipped** (1,147 total). Log: `.tmp/modern-ui/full-test-verified.log`.
- Skipped: the optional isolated-database watch measurement/OAuth lifecycle test. No live OAuth grant was created for this audit.
- Source typecheck passed using the scoped `.tmp/modern-ui/tsconfig.json`, which excludes historical generated build directories. Log: `.tmp/modern-ui/typecheck-verified.log`.
- Changed TSX and CSS parsed successfully; focused whitespace checks passed.
- Final focused regression run: **42 passed, 0 failed**. Clip-draft, auth-focus, billing-copy, playback, and navigation checks passed; log: `.tmp/modern-ui/focused-final.log`.

## Verification limits

Authenticated account data, staff dashboards, real OAuth login, email delivery, payment checkout, cancellation/refunds, and provider-owned subscription buttons were not transacted. Postcard ordering is intentionally paused and its unavailable state remains explicit. No account was created and no agreement was accepted.

Provider video playback still depends on provider availability and browser playback policy. The channel preview rendered its real Twitch controls; this is not a guarantee of provider autoplay on every browser. Cold local development renders and remote data refreshes sometimes took roughly 10–25 seconds. Check production loading performance separately from this visual pass.

An early local catalog render encountered the missing content-removal registry. A later read-only readiness check confirmed the registry and cleanup tables existed, and the homepage, Guide, search, and channel subsequently loaded. This design task did not alter the database or bypass content-availability filtering.

## Saved previews

- `output/modern-ui/home-netflix-desktop.jpg`
- `output/modern-ui/home-netflix-mobile.jpg`
- `output/modern-ui/premium-cta-desktop.jpg`
- `output/modern-ui/archive-light-desktop.jpg`

Generated background provenance and design tokens are recorded in `docs/DESIGN.md`.

## Complete route inventory

The table lists page templates rather than every possible dynamic URL. Redirects and authenticated tools are included in the source inventory; they are not all signed-in browser checks.

Page files inventoried: **89**.

| Route template | Source |
| --- | --- |
| /about/[slug]/numbers | app/about/[slug]/numbers/page.tsx |
| /about/[slug] | app/about/[slug]/page.tsx |
| /access | app/access/page.tsx |
| /account/digest | app/account/digest/page.tsx |
| /account/notifications | app/account/notifications/page.tsx |
| /account | app/account/page.tsx |
| /account/plan | app/account/plan/page.tsx |
| /account/settings/billing | app/account/settings/billing/page.tsx |
| /account/settings | app/account/settings/page.tsx |
| /admin/account-deletions | app/admin/account-deletions/page.tsx |
| /admin/accounts | app/admin/accounts/page.tsx |
| /admin/ai-usage | app/admin/ai-usage/page.tsx |
| /admin/articles/new | app/admin/articles/new/page.tsx |
| /admin/articles | app/admin/articles/page.tsx |
| /admin/billing | app/admin/billing/page.tsx |
| /admin/clips/new | app/admin/clips/new/page.tsx |
| /admin/clips | app/admin/clips/page.tsx |
| /admin/faces | app/admin/faces/page.tsx |
| /admin/fans | app/admin/fans/page.tsx |
| /admin/fanzone | app/admin/fanzone/page.tsx |
| /admin/instagram | app/admin/instagram/page.tsx |
| /admin/logo-submissions | app/admin/logo-submissions/page.tsx |
| /admin/media-intelligence | app/admin/media-intelligence/page.tsx |
| /admin/notifications | app/admin/notifications/page.tsx |
| /admin/originals | app/admin/originals/page.tsx |
| /admin | app/admin/page.tsx |
| /admin/passport | app/admin/passport/page.tsx |
| /admin/people | app/admin/people/page.tsx |
| /admin/photos | app/admin/photos/page.tsx |
| /admin/polls | app/admin/polls/page.tsx |
| /admin/postcards | app/admin/postcards/page.tsx |
| /admin/programming | app/admin/programming/page.tsx |
| /admin/radio | app/admin/radio/page.tsx |
| /admin/sign-in | app/admin/sign-in/page.tsx |
| /admin/social-fetch | app/admin/social-fetch/page.tsx |
| /admin/talents | app/admin/talents/page.tsx |
| /admin/x | app/admin/x/page.tsx |
| /author/[id] | app/author/[id]/page.tsx |
| /binder/postcards | app/binder/postcards/page.tsx |
| /channels/[slug] | app/channels/[slug]/page.tsx |
| /channels/[slug]/x | app/channels/[slug]/x/page.tsx |
| /chat | app/chat/page.tsx |
| /clips | app/clips/page.tsx |
| /clips/submit | app/clips/submit/page.tsx |
| /community | app/community/page.tsx |
| /crew/[slug] | app/crew/[slug]/page.tsx |
| /dvr | app/dvr/page.tsx |
| /fan-mail/[slug] | app/fan-mail/[slug]/page.tsx |
| /fan-mail | app/fan-mail/page.tsx |
| /fan-mail/postcard | app/fan-mail/postcard/page.tsx |
| /fanzone | app/fanzone/page.tsx |
| /feed | app/feed/page.tsx |
| /guide | app/guide/page.tsx |
| /legal/cookies | app/legal/cookies/page.tsx |
| /legal/data-deletion | app/legal/data-deletion/page.tsx |
| /legal/privacy | app/legal/privacy/page.tsx |
| /legal/terms | app/legal/terms/page.tsx |
| /links | app/links/page.tsx |
| /login | app/login/page.tsx |
| /logo-submissions | app/logo-submissions/page.tsx |
| /m/[slug]/numbers | app/m/[slug]/numbers/page.tsx |
| /m/[slug] | app/m/[slug]/page.tsx |
| /media | app/media/page.tsx |
| /metrics | app/metrics/page.tsx |
| /monitor/[slug] | app/monitor/[slug]/page.tsx |
| /multiview | app/multiview/page.tsx |
| /my-list | app/my-list/page.tsx |
| /news/[slug] | app/news/[slug]/page.tsx |
| /news | app/news/page.tsx |
| /originals/[slug] | app/originals/[slug]/page.tsx |
| / | app/page.tsx |
| /passport | app/passport/page.tsx |
| /preview | app/preview/page.tsx |
| /search | app/search/page.tsx |
| /shorts | app/shorts/page.tsx |
| /signup | app/signup/page.tsx |
| /special-message | app/special-message/page.tsx |
| /studio | app/studio/page.tsx |
| /studio/passport | app/studio/passport/page.tsx |
| /studio/postcards | app/studio/postcards/page.tsx |
| /theater | app/theater/page.tsx |
| /timeline | app/timeline/page.tsx |
| /tonight | app/tonight/page.tsx |
| /u/[handle] | app/u/[handle]/page.tsx |
| /upgrade | app/upgrade/page.tsx |
| /videos | app/videos/page.tsx |
| /watch/live/[login] | app/watch/live/[login]/page.tsx |
| /watch/network/[slug] | app/watch/network/[slug]/page.tsx |
| /watch | app/watch/page.tsx |
