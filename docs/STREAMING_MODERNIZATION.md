# Streaming modernization execution ledger

Requested September 8, 2026. Implementation authorized for phases 0–6. AI processing ceiling: $40/month; reuse stored analysis and prioritize free metadata. Public content stays free and the site remains unofficial.

## Audit baseline

- Existing canonical WatchItem catalog, provider adapters, persistent player, Shorts refill, multiview workspaces, deterministic Guide scheduling, watch history, My List and creator affinity should be extended.
- Media intelligence already has revisions, leases, policy gates, tombstones, segments, local hashed vectors and a PostgreSQL index. Remote analyzer/embedding interfaces are placeholders, not a deployed multimodal search service.
- September 8 production failures: media maintenance exceeds its 240-second HTTP deadline; face retention has no workflow URL/secret; metrics snapshot returns 500. CI has its push trigger disabled and depends on an external reusable workflow.
- Header padding is hardcoded despite wrapping banner text. Fixed contact UI overlaps cookie consent and playback. Home deduplication uses bare IDs despite platform-qualified catalog identities.
- Originals has pending/approved/rejected editorial records but no automatic suggestion pipeline.

## Milestones and acceptance

0. Audit and cleanup: capture workflow errors and responsive screenshots; repair shared chrome. Done when desktop/mobile content is unobscured and CI runs independently.
1. Catalog and ingestion: preserve provider identities, improve bounded/idempotent maintenance, expose actionable health. Done when scheduled jobs finish and repeated syncs do not duplicate content.
2. Search and intelligence: improve natural-language intent and moment evidence; add budgeted approved-content processing with durable accounting. Done when supported moment queries retrieve real evidence and work cannot exceed the configured AI allowance. Metadata-only results must not claim scene recognition.
3. Discovery and Originals: consistent media shapes and useful categories; background suggestions with manual review preserved. Done when collections receive traceable suggestions and approved items are playable.
4. Theater and Multiview: shared provider capability rules, clear failures, responsive controls, one audio owner and bounded embeds. Done when supported providers can be exercised in both modes without covering native interactions.
5. Guide and personalization: readable mobile programming, clear live/current/next, stable Continue Watching and preference controls. Done when schedule and watch state survive navigation correctly.
6. Release hardening: targeted regression tests, production build, responsive/browser verification, deploy immutable commit and verify production workflows. Done only after verification; a successful deploy alone is insufficient.

## Delivery rules

Use additive schema changes. Keep existing editorial decisions authoritative. Do not download or analyze third-party media without an existing approved source policy. Reserve paid work durably before submission, with retries accounted for. Never claim all archive moments are searchable when only metadata has been indexed.

Rollback: revert the application commit and redeploy the preceding immutable image; keep additive tables and user/editorial data. Suspend new background stages independently while leaving metadata search operational.

## Verification record

In progress. No milestone is marked complete until its acceptance evidence is recorded here.

### First release candidate — September 8

- Shared app-managed AI ceiling is $40/month UTC, not $40 per provider. PostgreSQL transaction locking serializes reservations across replicas. Database failures reject paid work. Uncertain requests retain reservations; automatic SDK retries are disabled. Provider invoices, pre-existing subscriptions and calls outside this application are not controlled by this ledger.
- Seven AI budget tests pass, including cross-provider concurrent reservations, uncertainty and fail-closed accounting. Full web suite: 776 passing.
- Local metadata sync: HTTP 200 in 3.46 seconds (87 queued, 3 analyzed, zero failures). Repeat: HTTP 200 in 3.77 seconds (87 unchanged, 13 newly discovered, 20 analyzed, zero failures). Catalog traversal now resumes 100-item slices, worker batches yield, and cron stages have independent deadlines.
- Browser inspection at 390×844 and 1905×904: compact mobile notice, four-line mobile title, separate 44px message/DJ controls, expandable mobile DJ controls. Hidden/mobile DJ no longer creates a WebGL visualization. Header spacing follows its measured height.
- Release 1138d6c deployed successfully and its running Azure image was verified. CI, metrics snapshot and media maintenance workflows passed on production. Media sync handled a 11,999-item inventory as a 100-item slice in about 16 seconds; 20 records analyzed. The archive stage required one retry after a database session-pool limit. Follow-up shares the primary/media connection pool and lowers per-replica limits.
- Face-retention credential is installed. Production verification found the preview middleware still blocked this exact route before its own authentication; a targeted bypass is being added while retaining its dedicated secret and staff checks.
- User explicitly confirmed permission for CORE creators' video/audio on September 8. This does not authorize unrelated accounts or imply blanket ownership. Paid deep processing remains inactive until the source registry and adapters are verified. Deep multimodal analysis, expanded Originals automation and remaining player/Guide phases are not yet delivered.

### Follow-up verification

- Release 4728eaa deployed as Azure revision 0000055; independent CI passed. Fresh production cron checks exposed two additional failures, so these workflows are not marked repaired yet.
- Face cleanup used PostgreSQL's reserved keyword `references` as an unquoted alias. Both occurrences were corrected. The actual retention function now executes successfully against the isolated development database inside a rolled-back transaction.
- Read-only production diagnosis found 1,755 failed media jobs referencing non-current revisions. New jobs now retain immutable metadata; obsolete revisions are cancelled instead of retried. Legacy input changes enqueue their current replacement. Archive responses now report worker failures through HTTP status instead of returning misleading success.
- Local verification after these corrections: 782 tests pass, typecheck passes, metadata sync HTTP 200 in 3.7 seconds with 20 analyzed and zero failures. Production verification of this follow-up is pending.

### Incremental discovery and Guide release

- Release cebcda1 deployed as Azure revision 0000056. Production retention workflow 34265090262 passed (HTTP 200; zero deletions). Media archive analyzed 100 records without errors; metadata sync exposed fractional TikTok durations rejected by its integer duration column. Follow-up normalizes the catalog duration while retaining the original provider precision for playback.
- Release 486d7a8 deployed successfully. Originals suggestions use title evidence, add pending records only, and respect approved/rejected source identities. Local run added 27 suggestions; a repeat added zero. Production run added 87 suggestions across nine collections. No paid AI calls are used for this stage.
- Social playback now preserves explicit photo geometry, honors TikTok/Instagram provider identifiers without an external URL, and rejects lookalike provider hosts when building embeds.
- Natural-language ranking removes conversational filler without changing exact-title matching. A behavior test locates a real chapter at 2:00 for a Minecraft-with-friends query; untimed metadata receives no invented timestamp. This is not full video/audio analysis.
- Mobile Guide now starts with a compact Now & next list and collapsed filters. Full timeline remains selectable; desktop defaults to timeline. Local 390px browser inspection verified visible Watch now controls, clear replay labels, and separate floating message/DJ buttons. Full suite: 791 passing, typecheck passing.
- All phases remain in progress. Rights-cleared transcript/scene processing, production moment coverage, full provider playback matrix, and comprehensive account/Multiview verification remain outstanding.

### Account consistency and production cron verification

- Production release 5255c99 passed deployment. Media-intelligence run 34274285283 passed every stage with HTTP 200: 100 records discovered, zero failures, and 46 new pending Originals suggestions. Fractional TikTok duration failures are resolved.
- Settings, membership/billing and upgrade now share a restrained header, navigation, width and responsive spacing. The billing summary separates loading from failure and includes retry. Account/upgrade routes collapse the DJ panel so it cannot cover billing controls.

### Reviewed transcript evidence

- New admin media-intelligence page imports authorized WebVTT/SRT captions by indexed asset key. Drafts require explicit review before approval; published excerpts carry real source timing, not generated scene claims. Staff can reject or revoke imports. Exact duplicates preserve previous decisions.
- Per-asset permission references remain private. Imports attach to an immutable source revision and expire after 90 days. Search excludes draft, revoked, superseded, expired, removed and restricted evidence. Retention purges expired transcript text and derived segments. No provider downloads or paid AI calls are performed by this path.
- Actual SQL lifecycle tests pass against the isolated development database, with all fixture changes rolled back: duplicate import, draft isolation, approval, 2:00 source timing, changed revision, expiry and revocation. Full web suite: 798 passing; typecheck passing.
- Release d0e3369 deployed successfully. Production 390px membership page inspected: shared three-tab navigation fits without horizontal scrolling, account status visible, compact message control, no DJ covering billing fields. Automated transcription/scene extraction and the full provider playback matrix are still outstanding.

### Multiview mobile repair

- Browser testing found an actual zero-height portrait iframe that was playing audio with no visible video. Mobile tile width/height/aspect constraints now provide a 304×540 visible portrait player at 390px. A real YouTube Short was visibly playing after the repair; page width stayed within the viewport.
- The Multiview toolbar uses separate mobile rows; labels and player counts no longer collapse into vertical text. All iframe providers can receive required native interactions. Expired direct video URLs fall back to the official embed where available.
- Twitch requires a minimum 400×300 embed and may require interaction on mobile ([official provider contract](https://dev.twitch.tv/docs/embed/video-and-clips/)). A too-small room tile now offers expansion/rotation guidance and an Open on Twitch link instead of an inoperative Activate button. At 390px the fallback measured 351×300 without page overflow. This is an explicit provider limitation, not a promise of unconditional mobile autoplay.

### Source discovery — September 8, 23:00 UTC

- Release fb0a179 deployed successfully (workflow 34284522616). All 801 tests passed for that release; the media maintenance workflow 34284522650 also passed.
- User asked the implementation to discover existing source connections itself. Rights for CORE creators' video/audio remain confirmed; do not re-ask for permission or assume the user knows the implementation's storage layout.
- Read-only production inventory: 13,525 active indexed assets (8,604 YouTube, 2,716 Instagram, 1,046 TikTok, 931 X, 228 Twitch), zero direct media references, zero caption fields and zero transcript imports. The 4,197 durable social event snapshots likewise contain no recording/caption artifacts. Provider CDN URLs are deliberately excluded from durable social snapshots because they expire.
- Social registry reports most integrations healthy, but this describes metadata ingestion, not creator recording access. Production has the public Social Fetch/API configuration, not the creator Instagram/TikTok token maps consumed by `social-credentials.ts`. Do not treat viewer OAuth connections as creator grants.
- Repository/public and workspace/assets discovery found the house reveal and four special-message videos, no VTT/SRT caption exports. Build directories contain duplicate copies of the same house reveal, not a creator archive.
- Production `SPACES_*` configuration still targets the old DigitalOcean `coreboys-media` bucket, which returns `404 NoSuchBucket`. The public `media.thecoreboys.com` name returns NXDOMAIN; Chrome inspection of the authenticated Cloudflare zone confirms no media DNS record. That account's only R2 bucket is a separate portfolio CDN, not the CORE Boys archive. No bucket, DNS, access policy, private viewer upload or credential was changed during discovery.
- Added reusable read-only `scripts/audit-media-sources.mjs`. It prints aggregate catalog/registry counts and lists only known public creator-asset prefixes; it never prints tokens, signed URLs or caption text. Cloud-provider errors and timeouts remain failures, not empty-source success.
- Admin coverage now separates indexed items, direct media references (unverified), live streams awaiting replay and unexpired approved caption imports. Failed health reads have an explicit retry state, and the endpoint no longer exposes raw database errors. A direct URL is not labeled ready or rights-cleared merely because it exists.
- Verification: 803 unit/behavior tests and typecheck pass. Actual local PostgreSQL coverage tests also pass for null/blank/non-string media fields and live/replay distinction, alongside the transcript lifecycle suite; all fixtures rolled back and no paid AI calls made.
- Still outstanding: restore/establish a working CORE media artifact connection or a supported caption-acquisition path, implement automated transcription/scene processing, and complete remaining product acceptance checks. The read-only audit does not claim those capabilities are delivered.

### Caption-first acquisition pilot

- Discovered a working source directly: original English YouTube captions on the configured official CORE channel `UC6H8_DvqnEp1tYEp10GzH0g`. A real CORE GOES BACK TO SCHOOL sample yielded 2,551 timestamped speech cues (168 search windows) without downloading the video or making paid AI calls. JSON3 conversion removes rolling-display duplicates while preserving source timing.
- Added a daily, two-video maximum caption-only worker. It checks the exact channel and public/non-live status, prefers manual English over original auto-captions, never requests translations, cookies or proxies, retries at most three times, and deletes its private temporary artifacts. Atomic claims prevent overlapping imports. Imports remain private drafts for staff review, retain permission provenance, and reject changed source revisions.
- This pilot uses the operator's confirmed CORE permission and costs no paid AI usage. It is not scene analysis, does not cover every creator/platform, and does not establish a replacement storage bucket. Deployment and hosted-run verification are tracked separately from the successful local acquisition.
- Fixed settings-page mobile overflow at the grid track and navigation sizing level; no page-wide overflow-hiding workaround.
