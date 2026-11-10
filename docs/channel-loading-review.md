# Channel loading review — 2026-11-09

Changes remain local. The owner asked to hold deployment until the rest of their updates are ready. Do not push main or deploy until they explicitly say to release.

## Reproduced

- The production CORE channel route streamed its shell around 1.14 seconds, but the document took about 16.5 seconds to finish and DOM content loaded around 28 seconds. Its compressed document transferred 3,336,647 bytes. Several concurrent public/account requests took 9–11 seconds.
- The route sent thousands of archive records to the browser even for the crew tab. The client rebuilt the complete duration schedule and refreshed the whole route every minute.
- Visible navigation and crew links prefetched unrelated pages. Expired artwork also started batches of thumbnail-recovery requests for cards well below the viewport.
- Public social-feed cache misses looked up Instagram/TikTok credentials and providers even though background reconciliation already persists those posts.

## Local changes

- Keep the complete archive and schedule calculation on the server. Transfer six initial cards per source/format and up to 60 exact upcoming airings. Refresh a small JSON snapshot instead of the whole route.
- Fetch older cards in cursor-based batches of 24. Preserve source attribution, signed artwork, original playback metadata, and the full archive. Failures show an inline retry action.
- Preserve live-interruption/resume timing using the same complete schedule inputs as the Guide. Returning to a tab refreshes its snapshot.
- Reuse historical cache entries through six hours of inactivity while the short-lived home snapshot supplies current live status, new uploads, and recently updated artwork. Fresh deletion filtering still runs after cache retrieval.
- Public page loads use saved Instagram/TikTok rows. Scheduled reconciliation retains the official/provider lookups. YouTube RSS/channel resolution now has bounded timeouts.
- Disable automatic navigation/crew-profile prefetching, retaining intentional dial-hover prefetching.
- Defer lazy thumbnail sources and recovery requests until within 200 pixels of the viewport. Eager hero images retain their existing loading behavior.
- Remove the crew section's outbound social buttons and unused social payload. Each card says “View profile”; the individual profile retains its social links.

## Verification

- Full suite: 1,237 passed; one skipped. Type checking and the optimized production build passed. The build reports existing warnings in unrelated modules.
- Functional coverage compares the bounded schedule with the full archive, tests exact resumed airings after live interruptions, walks every archive cursor without duplicates, and checks that a longer archive cache cannot keep ended streams live.
- In the browser, Jason's TikTok source advanced from 6 to 30 of 670 items. All ten crew cards linked only to their own `/crew/...` profile. Drew Wall's profile still showed X, Instagram, and Twitch.
- Local development documents transferred roughly 175–210 KB. An optimized production build running on localhost transferred 161,164 bytes: cold response completed in 9.78 seconds (first byte 343 ms), and the next warm response completed in 1.53 seconds (first byte 45 ms). These are server-response measurements, not browser paint times or a live-site latency guarantee. A fully cold archive rebuild still costs several seconds; the longer shared history cache is intended to make that exceptional. Verify cold/warm behavior against Azure after the owner authorizes the final release.
- Preview: `C:/Users/core/Desktop/thecoreboys/crew-profile-links-preview.png`.

Existing untracked `.tmp/` and `output/` directories contain local tooling/artifacts and must not be swept into a release commit.
