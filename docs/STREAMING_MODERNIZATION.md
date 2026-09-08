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
