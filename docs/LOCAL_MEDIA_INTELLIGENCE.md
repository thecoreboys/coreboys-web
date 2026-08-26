# Media intelligence pipeline

The default Watch intelligence pipeline runs locally. It does not use
`DATABASE_URL`, Redis, Azure, or a paid API. Azure services remain explicit
adapter interfaces until an operator supplies credentials and registers an
implementation during server bootstrap.

## Local setup

```dotenv
MEDIA_INTELLIGENCE_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:56222/coreboys_media_ai
MEDIA_INTELLIGENCE_PROVIDER=local
MEDIA_INTELLIGENCE_CRON_SECRET=replace-with-a-long-random-value
```

Run `pnpm db:apply-media-intelligence` to apply
`scripts/migrations/012_media_intelligence.sql`, followed by
`scripts/migrations/027_deep_media_intelligence.sql`. Runtime schema guards are
idempotent, but visitor search requests never discover or analyze the catalog.
The dedicated database URL must be loopback unless an explicit deployment sets
`MEDIA_INTELLIGENCE_ALLOW_REMOTE_DATABASE=true`.

PostgreSQL is the local source of truth. Existing `vector` and `pg_trgm`
extensions enable optional acceleration. Embeddings also remain in `real[]`,
so Redis is unnecessary.

## Analyze once, keep every stage

The stable idempotency key includes the asset revision, analysis stage,
analyzer/version, normalized input, and source-policy version. Transport URLs,
thumbnails, and live viewer counts do not create a new content revision.

Segments, tags, embeddings, and artifacts belong to an immutable analysis run.
Completion uses idempotent upserts and never deletes another run or stage's
outputs. Source policies, jobs, artifacts, index generations, tombstones,
catalog syncs, and a transactional outbox are all durable database records.

## Rights and metadata-only fallback

Provider links and embeds are not permission to download media. Twitch,
YouTube, TikTok, Instagram, and X default to metadata-only analysis. Deep
analysis requires all of the following:

- an `owned` or `licensed` source policy;
- `requestedMode: "deep"` and `mediaAccessAllowed: true`;
- a stable, explicitly authorized media artifact.

If any condition is absent, the analyzer safely uses public metadata only.
`restricted` and `skip` sources enqueue no analysis.

## Background sync and workers

Catalog discovery is scheduler/admin owned and never search-request coupled.

```bash
pnpm media-intelligence:sync
```

That script calls `POST /api/media-intelligence/catalog-sync` using the
`x-media-intelligence-secret` header. The checked-in workflow runs every six
hours and executes one failure-isolated maintenance cycle: current discovery,
one bounded archive-backfill batch, retention/tombstone cleanup, then index
publication. Cleanup and publication therefore do not depend on a visitor or
an admin remembering to run them. `GET /api/admin/media-intelligence` reports assets, stage/run coverage,
queue status, dead letters, artifacts, tombstones, outbox depth, and Azure
adapter readiness. Its protected POST actions are `sync`, `work`,
`retry-dead-letter`, `cleanup`, `publish-index`, and `tombstone`.

Archive backfill is resumable rather than a larger homepage-feed request.
`media_intelligence_archive_checkpoints` stores one opaque page token per
source. Built-in enumerators use official Twitch Helix VOD pagination,
YouTube's uploads-playlist pagination when `YOUTUBE_API_KEY` exists, and the
already-ingested `social_content_events` cache for Instagram, TikTok, and X.
Licensed/private sources can register the same adapter contract. Missing
provider credentials simply omit that provider; they never break local
metadata indexing. Increase `MEDIA_INTELLIGENCE_ARCHIVE_MAX_PAGES` gradually,
not the public catalog bounds.

Long analyzer jobs renew their database lease while running. Set
`MEDIA_INTELLIGENCE_JOB_LEASE_SECONDS` above the expected heartbeat/network
jitter (default 300 seconds). Claims, renewals, and completion all re-check the
current rights policy. A revoked policy cancels queued work and prevents a
stale worker from committing a successful job.

The local worker processes metadata jobs. Azure Content Understanding, Video
Indexer, Blob Storage, Service Bus, Azure AI Search, and Azure OpenAI embedding
configuration lives in `lib/media-intelligence/azure.ts`. Blank credentials do
not affect builds or tests. Content Understanding defaults to the locked
production GA API version `2025-11-01`.

## Retention and deletion

The bounded homepage catalog is not treated as proof of deletion, so it cannot
erase older archive results. Provider deletion and rights-removal handlers call
the exported `tombstoneMediaAsset` helper; an operator can use the protected
admin `tombstone` action with `assetKey`, `reason`, and optional
`deleteAfterDays`. The asset is hidden immediately, jobs are cancelled, the
outbox records the event, and scheduled retention removes local rows, remote
search documents, and authorized artifacts. Expired artifacts are deleted
through the registered artifact store, old completed jobs are pruned, and all
pending work remains visible in admin coverage.

## Search

`GET /api/watch/search` only reads the latest completed generation. The legacy
`sync` response field is a snapshot of the latest scheduled/admin run.
`refresh=true` does not trigger discovery, queuing, or analysis.
