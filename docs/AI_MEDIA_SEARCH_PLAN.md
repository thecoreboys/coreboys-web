# CORE AI media search — approval plan

Status: proposed only. No Microsoft resource, model, analyzer, index, or paid job has been created.

## Outcome

Every authorized media revision is analyzed once, saved durably, and reused for every viewer and every future search. Search never sends an entire photo or video back through a vision model. It searches saved titles, transcripts, OCR, visual descriptions, entities, tags, timestamped moments, and vectors.

```text
YouTube / Twitch / TikTok / Instagram / X / CORE media
                         │
                         ▼
          canonical item + rights check + fingerprint
                         │
             ┌───────────┴───────────┐
             │ new/changed revision? │
             └───────────┬───────────┘
                         ▼ yes
          one idempotent analysis job (never per viewer)
                         │
     metadata + geometry + transcript + OCR + keyframes
     + chapters + structured tags + entities + safety labels
                         │
                         ▼
        PostgreSQL truth + immutable analysis artifacts
                         │
                         ▼
       timestamped segment documents + persistent vectors
                         │
                         ▼
        Azure AI Search hybrid retrieval and reranking
                         │
                         ▼
 thumbnail results + reason matched + exact play timestamp
```

## Recommended Microsoft stack

- Microsoft Foundry / Azure Content Understanding GA analyzers for the default image, audio, and video route: `prebuilt-imageSearch`, `prebuilt-audioSearch`, and `prebuilt-videoSearch`.
- `text-embedding-3-small` as the first embedding deployment. Only trial `text-embedding-3-large` if a measured evaluation set proves the retrieval gain is worth it.
- Azure AI Search as a rebuildable serving index: exact terms + BM25 + vectors + filters + hybrid Reciprocal Rank Fusion + semantic reranking.
- Existing PostgreSQL as the authoritative catalog, analysis ledger, overrides, entity registry, watch state, and audit store.
- Blob/object storage for authorized originals and immutable analyzer outputs. Search is not the only copy.
- Service Bus or another durable queue plus a worker outside Vercel for long-running, retryable analysis.
- Azure AI Video Indexer only for a measured subset of long broadcasts that needs its deeper scene, shot, OCR, object, topic, and named-entity insights. Do not run two expensive video analyzers on everything.
- Optional later: `gpt-4.1-mini` for strict structured JSON on genuinely ambiguous classification or query-to-filter cases. It is not required on every query.

Official references:

- [Content Understanding REST quickstart](https://learn.microsoft.com/en-us/azure/ai-services/content-understanding/quickstart/use-rest-api)
- [Content Understanding analyzer reference](https://learn.microsoft.com/en-us/azure/ai-services/content-understanding/concepts/analyzer-reference)
- [Azure AI Video Indexer insights](https://learn.microsoft.com/en-us/azure/azure-video-indexer/insights-overview)
- [Foundry embeddings](https://learn.microsoft.com/en-us/azure/foundry/openai/tutorials/embeddings)
- [Azure AI Search hybrid queries](https://learn.microsoft.com/en-us/azure/search/hybrid-search-how-to-query)
- [Azure AI Search fuzzy search](https://learn.microsoft.com/en-us/azure/search/search-query-fuzzy)
- [Azure AI Search security trimming](https://learn.microsoft.com/en-us/azure/search/search-security-trimming-for-azure-search)

## The analyze-once guarantee

The unit of work is an immutable media revision, not a URL.

```text
analysis_key = SHA256(
  content_fingerprint
  + analyzer_name_and_api_version
  + analyzer_definition_hash
  + taxonomy_version
  + output_schema_version
  + locale_policy_version
)

embedding_key = SHA256(
  normalized_segment_text_hash
  + embedding_model_and_version
  + dimensions
  + text_normalizer_version
)
```

Rules:

- The same `analysis_key` returns saved artifacts and is never resubmitted.
- A metadata-only edit patches filter/text fields and only re-embeds changed derived text.
- Changed source bytes create a new revision; old analysis stays auditable.
- A taxonomy rename is derived from stored analyzer JSON whenever possible; it does not reread the media.
- A new embedding model re-embeds saved text, not photos or videos.
- A model/analyzer change first runs on a 1–5% shadow sample and requires a measured approval before corpus-wide work.
- Human corrections live in a separate authoritative override table and are never overwritten by AI.
- Provider deletion or lost rights removes the search document and artifacts and creates a rediscovery tombstone.
- A unique database constraint on `analysis_key` plus queue idempotency prevents double billing after retries.

## Media-specific routes

| Media | Analyze once | Search result |
|---|---|---|
| Photo | dimensions/orientation, caption, OCR, objects, setting, approved people/entities | correct-aspect thumbnail and one asset result |
| Carousel | each immutable image once; deterministic parent manifest | parent result with child matches |
| Short/Reel/TikTok | transcript, OCR, keyframes, scenes, people/entities, activity, mood | 9:16 preview plus exact matching moment |
| YouTube video | provider metadata, captions when authorized, transcript, chapters, scenes/keyframes | long-form card plus matching chapter/timestamp |
| Twitch/YouTube broadcast | metadata while live; deep analysis once the replay stabilizes | Live result now; timestamped replay after it ends |
| Clip | short-video route | compact preview and matching moment |
| Text post | deterministic normalization; optional one structured classification | one searchable post result |
| Unlicensed/unavailable media | permitted provider metadata and thumbnail only | clearly marked `metadata_only`; never claim visual/audio analysis |

Active livestreams should not be repeatedly analyzed. Index official live metadata immediately, then analyze the stable archive once. Rolling live transcription is a separate optional decision.

## Stored taxonomy

- media kind: live, long video, broadcast, short video, clip, photo, carousel, audio, text;
- provider, creator account, CORE member, channel, series/show, event;
- orientation, exact aspect ratio, duration band, language, captions;
- topic, activity, setting, objects, game/category, guests, brands;
- transcript, OCR, visual description, summary, chapters/scenes;
- live/availability/embed state, publish time, rights tier;
- safety/age-policy labels;
- canonical entity IDs with aliases and spelling variants;
- evidence source, confidence, analysis run, and timestamp range for every derived fact.

Example entity aliases make `jshock`, `j shock`, common misspellings, and approved handle variants resolve to one entity. An editorial concept map can connect `e-date`, `dating show`, `20v1`, `20 women vs 1`, `rizz`, and related CORE series without falsifying the original title.

Do not infer sensitive traits, health, ethnicity, sexuality, attractiveness, or identity from appearance. Facial identification stays off. Named people come from the approved roster, authorized metadata/transcripts, or human tags.

## Persistent schema

- `media_assets`: stable logical/provider item and current revision pointer.
- `media_revisions`: content hash, provider fingerprint, dimensions, rights, availability.
- `analysis_runs`: `analysis_key`, versions, operation ID, status, measured units, error, immutable output reference.
- `analysis_artifacts`: raw analyzer JSON, keyframes, transcript, and embedding sidecars.
- `media_segments`: type, ordinal, start/end seconds, normalized retrieval text, language.
- `entities`, `entity_aliases`, `segment_entity_mentions`: the curated CORE entity graph and evidence.
- `manual_overrides`: correction, reviewer, reason, effective date.
- `ingestion_jobs`: lease, attempt, estimated cost, idempotency key, dead-letter state.
- `outbox_events`: transactional index/queue publication.
- `deletion_tombstones`: provider ID/hash and reason.
- `search_queries`, `search_clicks`, `watch_outcomes`: minimized relevance telemetry with retention limits and no raw secrets.

One Azure AI Search document represents one searchable segment and repeats the safe parent fields needed for filtering. Long videos therefore have multiple timestamped matches, while the UI groups them back into a single asset.

## Query flow

1. Authenticate and derive visibility/ACL filters.
2. Normalize Unicode, handles, aliases, dates, providers, content types, and watch-state words.
3. Parse explicit filters deterministically: for example, `unwatched Jason shorts from TikTok`.
4. Reuse a cached query vector, or embed only that new normalized query—not any media.
5. Search exact identifiers/title/aliases, BM25 text, and one vector field in parallel.
6. Apply availability, rights, member, provider, kind, date, live, and ACL filters to every branch.
7. Merge with RRF, rerank the top candidates, group segments by asset, and retain the best timestamp/evidence.
8. Boost a live result only when it also clears a relevance threshold.
9. Apply a small signed-in preference/watch-state rerank after shared relevance. Explicit query intent always wins.
10. Return thumbnail, format/member/platform, watched progress, why it matched, and Play/My List actions.

Fuzzy Lucene matching is a fallback for names, likely misspellings, or zero-result searches. It should not expand every term on every query. Generative query rewriting remains a later shadow experiment, not a launch dependency.

## Search UI contract

- A wide fixed overlay with no page movement.
- Correct 16:9, 9:16, 1:1, or natural photo thumbnails.
- Muted hover/focus preview only where the provider permits it.
- Tabs for Everything, Live, Videos, Broadcasts, Shorts/Reels/TikToks, Photos, and Posts.
- Creator and provider facets.
- Unwatched, Continue, and Watched state with progress.
- Clear Play, My List, and Multiview actions; no unexplained grid icon.
- Arrow keys change selection, Enter plays, Escape closes, `/` opens search.
- Empty search shows Live Now, Continue Watching, and recent/trending discoveries.
- AI results show a concise reason: `JShock · dating-show concept · transcript match at 12:43`.
- Moment matches open at their exact timestamp.
- Search suggestions include corrected spelling and useful filters, but never silently replace an exact query.

## Cost controls

- Rights and duplicate checks happen before a model call.
- Use provider captions/transcripts before paying to transcribe again.
- Analyze stable live replays once, not rolling streams by default.
- Use geometry/codec metadata and scene sampling before multimodal work.
- Store every raw output and embedding so search-index rebuilds are cheap.
- Batch embeddings and begin with `text-embedding-3-small`.
- Use semantic reranking only for actual non-empty search queries.
- Cache normalized query embeddings by model version.
- Add per-item estimates, daily admission ceilings, and a dead-letter queue.
- Deep-analyze older archives by popularity/priority instead of launching the whole corpus blindly.

## Evaluation gate

Build 200–500 human-labeled queries across exact titles, creator aliases, misspellings, quotes, visual-only details, OCR, games/topics, dates, live intent, short/long formats, and searches that should return nothing. Include examples such as `jshock edate` with the expected result and timestamp.

Measure Recall@10/50, Precision@10, MRR, nDCG@10, zero-result rate, timestamp accuracy, p50/p95 latency, stale/deleted result rate, and ACL leakage. Slice results by provider, creator, type, duration, and metadata-only versus deep analysis. ACL leakage and deleted-content return must both be zero.

## 38 approval decisions

### Recommended baseline

1. Content-address every authorized media revision.
2. Enforce one unique versioned `analysis_key`.
3. Use Content Understanding as the default multimodal analyzer.
4. Route by modality instead of sending everything through one expensive flow.
5. Keep live streams metadata-only until a stable replay exists.
6. Persist immutable raw analyzer output.
7. Persist embeddings outside the serving index so it can be rebuilt.
8. Index timestamped segments rather than one giant VOD document.
9. Maintain a curated CORE entity and alias registry.
10. Record evidence and confidence for every derived field.
11. Keep human corrections authoritative and separate.
12. Use one baseline retrieval-text vector per segment.
13. Combine exact, lexical, vector, and semantic ranking.
14. Reserve fuzzy matching for typo recovery.
15. Boost live only above a relevance threshold.
16. Group scene hits into one playable asset result.
17. Return the best timestamp and the reason it matched.
18. Cache query embeddings by normalized query and model version.
19. Make result caches ACL-, filter-, ranking-, and index-version-aware.
20. Security-trim lexical and vector branches independently.
21. Use a durable queue, DB idempotency, retries, and a dead-letter queue.
22. Propagate provider deletions and rights changes immediately.
23. Log estimated and actual processing units per asset.
24. Require offline relevance gates before changing models or ranking.

### Optional after a measured pilot

25. Route selected long broadcasts to Video Indexer instead of the default analyzer.
26. Analyze immutable rolling live chunks once for near-live transcript search.
27. Add a second visual/multimodal vector only if visual-only searches remain weak.
28. Trial `text-embedding-3-large` only if relevance gains justify it.
29. Use `gpt-4.1-mini` for ambiguous query-to-filter JSON.
30. Shadow-test generative query rewriting before exposing it.
31. Add translated search fields when usage proves multilingual demand.
32. Add stronger safety/age filtering if the product needs it.
33. Add signed-in personalization after relevance retrieval.
34. Test vector quantization only after measuring nDCG impact.

### Avoid

35. Reanalyzing an item on every provider crawl or every user search.
36. Running Content Understanding and Video Indexer on every video.
37. Facial recognition or inferred sensitive personal traits.
38. Vector-only search, fuzzy-every-term search, scraping, or storing media without rights.

## Inputs required before a pilot

- Azure subscription/tenant owner and allowed region.
- Hard pilot and production budget ceilings.
- Catalog count and archive hours by provider/type, longest VOD, and monthly growth.
- Expected searches per day and peak concurrency.
- Download, temporary-processing, original-storage, and derivative-storage rights per provider/account.
- Public/member/admin/creator-private visibility rules.
- Approved member, handle, guest, series, show, game, and concept aliases.
- Required languages.
- Confirmation that biometric identification remains disabled.
- Metadata-only versus rolling-transcript live requirement.
- Retention and deletion SLA.
- A first relevance set of real searches and expected results/timestamps.
- Latency and timestamp-accuracy targets.
- Azure resources that may already be reused.
- Whether connected users search only CORE media or also their wider private libraries.

## Rollout

1. **Pilot:** 100–250 mixed items, no live transcription, one embedding model, private admin QA.
2. **Quality gate:** label real searches, tune taxonomy/aliases/ranking, prove deletion and ACL behavior.
3. **Archive:** idempotent backfill by priority; search uses metadata immediately and improves as items finish.
4. **Product launch:** server search API, preview-rich UI, exact moments, watch-state/personalization rerank.
5. **Optional expansion:** selected Video Indexer routes, multilingual fields, rolling-live chunks, large embeddings, or query rewrite only when metrics justify them.
