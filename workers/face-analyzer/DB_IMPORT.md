# Local PostgreSQL worker bridge

This bridge connects the protected local worker to
`scripts/migrations/024_face_presence.sql`. Database writes are available only
through that migration's narrow `SECURITY DEFINER` worker functions. The worker
has no direct write privilege on face jobs, tracks, template metadata,
heartbeats, or audit rows.

## Data boundary

Proposal import sends only:

- the worker id, owned DB job id, and a deterministic external proposal id;
- a canonical DB identity UUID or `NULL` for Unknown;
- media PTS start/end, one sample's normalized geometry, match method, and
  accepted similarity score/margin when the method is automatic.

It does not send display names, profile paths, social accounts, frames, crops,
reference images, features, embeddings, model vectors, or local template keys.
The web application resolves profiles from its canonical member/crew data.
Every imported row remains `proposed` or `unknown`; the functions cannot approve
or publish it.

Template synchronization sends non-biometric readiness metadata only: consent
and identity UUIDs, SFace model SHA-256, a keyed local template fingerprint,
template/reference counts, approved reference hashes, worker id, and expiry.
The HMAC key and vectors remain local.

## Provisioning order

Use PostgreSQL on the same machine or another explicitly loopback-bound local
instance. Provision the login before applying migration 024 so its conditional
hardening block removes legacy ACLs and grants the current contract:

```sql
CREATE ROLE core_face_worker LOGIN;
GRANT CONNECT ON DATABASE coreboys_media_ai TO core_face_worker;
GRANT USAGE ON SCHEMA public TO core_face_worker;
```

Set the password out of band (for example, interactive `psql \password`) rather
than placing it in this repository or shell history. Then apply migration 024
through the repository's normal migration runner.

If `core_face_worker` existed under an older version of this guide, reapply the
current migration after the role exists. Its conditional block explicitly
revokes legacy table, column, and sequence privileges before regranting the
contract below. Do not layer these grants on top of the old role without that
revocation step.

The resulting direct reads are limited to these columns:

```sql
GRANT SELECT (id, state, canonical_kind, canonical_slug)
ON TABLE face_identities TO core_face_worker;

GRANT SELECT (id, identity_id, subject_confirmed_adult,
  allow_template_creation, allow_live_matching, allow_archive_matching,
  approved_content_ids, revoked_at, expires_at, created_at)
ON TABLE face_consents TO core_face_worker;

GRANT SELECT (consent_id, identity_id, content_id, start_ms, end_ms)
ON TABLE face_consent_archive_scopes TO core_face_worker;

GRANT SELECT (identity_id, consent_id, content_sha256, subject_approved,
  state, revoked_at, reviewed_at, reviewed_by, created_by,
  retention_expires_at)
ON TABLE face_reference_assets TO core_face_worker;

GRANT SELECT (id, content_id, source_kind, state, operation_mode,
  all_visible_people_consented, recognition_enabled,
  automatic_matching_enabled, automatic_publish_enabled,
  kill_switch_active, active_session_id)
ON TABLE face_sources TO core_face_worker;

GRANT SELECT (source_id, identity_id, consent_id)
ON TABLE face_source_identities TO core_face_worker;

GRANT SELECT (id, identity_id, consent_id, model_name, model_version,
  template_fingerprint, template_count, reference_hashes, worker_id,
  state, expires_at, created_at)
ON TABLE face_template_sets TO core_face_worker;
```

All state changes use only these exact functions:

```sql
GRANT EXECUTE ON FUNCTION claim_face_archive_job(text, integer, uuid, boolean)
TO core_face_worker;
GRANT EXECUTE ON FUNCTION heartbeat_face_job(uuid, text, integer)
TO core_face_worker;
GRANT EXECUTE ON FUNCTION finish_face_job(uuid, text, text, text)
TO core_face_worker;
GRANT EXECUTE ON FUNCTION import_face_track_proposal(
  text, uuid, text, text, uuid, bigint, bigint,
  real, real, real, real, real, real
) TO core_face_worker;
GRANT EXECUTE ON FUNCTION sync_face_template_set(
  text, uuid, uuid, text, text, integer, text[], timestamptz
) TO core_face_worker;
GRANT EXECUTE ON FUNCTION attest_face_template_purged(uuid, text, text, text)
TO core_face_worker;
GRANT EXECUTE ON FUNCTION heartbeat_face_worker(text, text, boolean, text, text, text)
TO core_face_worker;
```

There is intentionally no direct access to `face_jobs`, `face_tracks`,
`face_audit_log`, `face_worker_heartbeats`, consent evidence, storage locators,
reviewer/publisher fields, or any sequence. Do not use `GRANT ALL`, database-owner
credentials, or a public database endpoint.

## Admin prerequisites

V1 is archive/VOD-only. Before a biometric archive job can be claimed:

1. `face_sources.content_id` exactly matches the protected worker config key
   (for example `yt-dQw4w9WgXcQ` or `vod-event-2026-08-21`), the source is an
   active archive source, and review-only recognition is enabled.
2. Every assigned adult subject has current archive/template consent whose
   `approved_content_ids` contains that exact content id.
3. One immutable `face_consent_archive_scopes` interval wholly covers the job's
   explicit `startMs`/`endMs` range.
4. Enrollment references are subject-approved, retained, and independently
   approved by a second administrator. Successful local enrollment creates an
   active `face_template_sets` metadata row; raw references may then follow
   their separate deletion schedule.
5. The source allowlist, all-visible-consent assertion, recognition switch,
   automatic matching switch, and global environment gates are active. The kill
   switch is off. Automatic publishing remains impossible.
6. The admin creates an `archive_scan` or `manual_review` job with explicit
   `{startMs,endMs}` bounds. Input URIs never come from the DB or client; the
   worker resolves the content id through its protected local config.

Revocation, expiry, model replacement, job cancellation, or kill-switch changes
fail closed. An owned job heartbeat is checked at most once per second while
frames/events flow. Cancellation and proposal removal are transactional in the
database.

## Environment and operation

Install the optional, pinned DB dependency:

```powershell
.venv\Scripts\python -m pip install -r requirements-db.txt
$env:FACE_ANALYZER_DATABASE_URL = "postgresql://core_face_worker:LOCAL_PASSWORD@127.0.0.1:56222/coreboys_media_ai"
$env:FACE_ANALYZER_WORKER_ID = "face-worker-local-01"
$env:FACE_ANALYZER_ENABLED = "true"
$env:FACE_AUTOMATIC_MATCHING_ENABLED = "true"
```

Leave both biometric flags unset for a manual-only rollout. The service still
processes `manual_review` jobs and runs purge/retention, but its heartbeat says
`automatic_capable=false` with no model version and the claim RPC cannot give it
automatic work.

The URL is environment-only and is rejected unless its effective host is a
literal loopback address or `localhost`; query-string host/hostaddr/service
overrides are rejected. Keep the URL, password, and media locators out of JSON,
NDJSON, logs, shell history, and source control.

Execute one targeted job:

```powershell
core-face-analyzer run-job `
  --config config.local.json `
  --job-id 00000000-0000-0000-0000-000000000001 `
  --worker-id face-worker-local-01
```

The normal deployment command is the supervised service loop:

```powershell
core-face-analyzer serve `
  --config config.local.json `
  --worker-id face-worker-local-01 `
  --poll-seconds 5
```

Run it under an OS service manager configured to restart on failure and stop it
gracefully during maintenance. The loop claims one bounded archive/manual job
at a time, renews its lease, synchronizes exact local purge requests/tombstone
acknowledgements, and enforces 7-day manual-evidence/30-day diagnostic cleanup.
Only when both local biometric gates are enabled and both model files match
their configured digests does it advertise automatic-claim capability and send
the SFace model version. Otherwise it reports honest manual-only liveness and
admin biometric readiness stays degraded. If the loop stops, its heartbeat
becomes stale and readiness must turn false.

The CLI holds a cross-platform OS singleton lock for the lifetime of `serve`.
Stop the supervised service before an operator runs enrollment or purge
commands; concurrent mutations fail closed. The enrollment and purge-tombstone
stores independently lock and reload every read-modify-write, preventing stale
processes from resurrecting deleted templates or losing a synchronized set.

`work-once` is a diagnostic queue poll. `import-proposals` is an operator bridge
for an already owned, unexpired job and atomically finishes that job:

```powershell
core-face-analyzer import-proposals `
  --config config.local.json `
  --session review-vod-example `
  --job-id 00000000-0000-0000-0000-000000000001 `
  --input .local-data\events.ndjson `
  --worker-id face-worker-local-01
```

## Proposal behavior

- Duplicate sample events collapse deterministically.
- Each sample becomes a short PTS interval with its own bbox. Unknown and known
  samples stay separate; gaps and moving geometry are not bridged or averaged.
- A track whose recognized identity changes is rejected as a whole.
- The proposal RPC requires the caller's unexpired job lease and rechecks job,
  source, exact archive bounds, consent, allowlist, active template metadata,
  and kill switch inside the import transaction.
- Proposal insertion and successful job completion commit atomically.
- Admin cancellation atomically removes that job's private proposed/unknown
  rows. No worker path can approve or publish.

The public web layer must still independently enforce current public-tag and
profile-link consent and resolve every handle from canonical profile data.
