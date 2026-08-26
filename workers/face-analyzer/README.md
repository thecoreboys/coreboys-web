# CORE local face-tag proposal worker

This worker is the $0-software analyzer slice for closed-set, consented face
tagging. It creates **review-only proposals** for the admin/API review layer. It
does not publish tags, call a cloud API, search the internet, read pixels from a
Twitch/YouTube embed, or fine-tune a model.

The safer default for IRL or uncontrolled scenes is `manual` mode. An admin
places a box at a few media timestamps, assigns an allowlisted identity (or
explicit `Unknown`), and the worker interpolates the box at real media PTS.
Manual mode never loads a face detector, recognizer, or biometric template.

`biometric` mode is available only for a bounded, controlled archive/VOD where
the operator has affirmatively declared that **everyone who can appear is
consented**. It uses OpenCV YuNet for face detection and SFace for fixed
embeddings. "Enrollment" means calculating 3–20 embeddings from approved
reference images; it is not training or fine-tuning. V1 never claims or imports
a live biometric job.

## Safety boundaries

The process refuses to run when any of these checks fails:

- `FACE_ANALYZER_ENABLED` is not exactly `true`, or
  `FACE_AUTOMATIC_MATCHING_ENABLED` is not exactly `true` for matching/evaluation;
- `FACE_ANALYZER_DATABASE_URL` is absent for a biometric operation (except the
  explicit non-production `FACE_ANALYZER_ALLOW_CONFIG_ONLY=true` test escape);
- session is missing, inactive, expired, or in the wrong mode;
- source is not explicitly authorized;
- a file is outside configured `media_roots` or `enrollment_roots`;
- HLS/OBS is not on an allowed loopback host, contains credentials, or uses an
  unexpected protocol;
- biometric mode lacks the all-visible-participants consent declaration;
- an identity is outside both source and session allowlists;
- required template, archive matching, content, or PTS-interval consent is
  missing or expired;
- model files are absent or do not exactly match configured SHA-256 digests;
- a decoded frame lacks media PTS or timestamps move backwards;
- `review_only` is not `true`.

The local migration-024 DB is authoritative for biometric enrollment,
matching, and evaluation. Enrollment requires the exact archive `content_id`
in active adult consent plus every input byte hash in a current protected
reference approved by an independent second reviewer. Successful enrollment
activates a metadata-only `face_template_sets` row (model hash, HMAC
fingerprint, count, reference hashes, worker owner, expiry); vectors and the
HMAC key remain local. Matching also requires one immutable archive-consent PTS
scope covering the entire requested interval, then checks source allowlist,
mode, all-participant flag, kill switch, and recognition/matching toggles
before model load and at most one second apart while frames flow. Retained raw
reference images are not required after template synchronization. Removing the
DB URL stops an active DB-authoritative run; it never falls back silently.

V1 DB-authoritative recognition is archive/VOD-only. Live biometric jobs and
imports fail closed. Manual local tracking remains non-biometric, but DB track
assignment still requires an exact archive consent interval.

Recognition is closed-set. Low-quality faces, scores below threshold, ambiguous
top-two scores, identities without enrollment, and identities outside the
session allowlist become explicit `Unknown`. A candidate name is not emitted
until it wins at least 3 of the latest 5 observations on the same geometry-only
track (configurable). Output events never include frames, crops, features, or
embeddings. Unknown embeddings exist only transiently for comparison and are
discarded with the current frame iteration.

This is not liveness detection and must not be used for authentication,
moderation, access control, law enforcement, or adverse decisions.

## Install locally

Python 3.11 or 3.12 is recommended. From this directory:

```powershell
py -3.11 -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m pip install -e . --no-deps
Copy-Item config.example.json config.local.json
```

No model is downloaded by install or by the worker. Read
[`MODELS_AND_LICENSES.md`](MODELS_AND_LICENSES.md), obtain YuNet and SFace from
the official OpenCV Zoo yourself, calculate each file's digest, then enter the
paths and digests in `config.local.json`:

```powershell
Get-FileHash .\models\face_detection_yunet_2023mar.onnx -Algorithm SHA256
Get-FileHash .\models\face_recognition_sface_2021dec.onnx -Algorithm SHA256
```

The example deliberately contains non-digest placeholders, so biometric
commands fail closed until this is done. `models/`, `.local-data/`,
`config.local.json`, and the generated lock are ignored locally.

### Dependency lock guidance

`requirements.txt`, `requirements.in`, and `pyproject.toml` pin the same direct
versions. Before deploying on a particular OS/CPU, generate and commit or
archive a hash-checked lock for that environment:

```powershell
.venv\Scripts\python -m pip install pip-tools==7.5.0
.venv\Scripts\pip-compile --generate-hashes --output-file requirements.lock requirements.in
.venv\Scripts\python -m pip install --require-hashes -r requirements.lock
```

For a deployed biometric worker, compile
`requirements-db.in` into `requirements-db.lock` instead. The base analyzer has
no database client dependency and therefore supports only manual mode or the
explicit non-production config-only test escape.

PyAV wheels bundle/link FFmpeg differently by platform. Keep a lock per target
platform and audit that exact wheel's licenses before distribution. Do not
silently upgrade OpenCV or either ONNX file: changing SFace invalidates stored
templates and the worker rejects a model-fingerprint mismatch.

## Configuration workflow

1. Copy the example; never add API tokens, stream keys, cookies, or passwords.
2. Create local `authorized-media/` and `authorized-enrollment/` directories.
3. Add one identity record per person with the canonical `member`/`crew` kind
   and slug. Do not copy profile routes or social URLs into worker config.
4. Record explicit, time-bounded consent for template creation and the exact
   archive content/PTS interval. `public_tag` is visible to operators but does
   not authorize or block private worker proposals.
5. Add an exact source and its participant allowlist. File paths must remain
   under `media_roots`. HLS/OBS URLs must use a configured loopback host.
6. Create a short-lived session with the smallest identity allowlist possible.
7. Keep `review_only: true`. The web layer must re-resolve the canonical DB
   identity and independently require current public-tag/profile-link consent
   plus human approval before any public presence event.

An allowlist alone does not make an uncontrolled scene safe. A recognition
system still calculates a transient embedding for every detected face in order
to compare it. Use biometric mode only when everyone who might appear has opted
in; otherwise use manual mode.

Biometric operations are off by default. Set gates in the process environment
only for an approved operator session:

```powershell
$env:FACE_ANALYZER_ENABLED = "true"
$env:FACE_ANALYZER_WORKER_ID = "face-worker-local-01"
# Set this second flag only while an approved matching session is running.
$env:FACE_AUTOMATIC_MATCHING_ENABLED = "true"
```

Manual mode does not read or require either biometric gate.

`FACE_ANALYZER_ALLOW_CONFIG_ONLY=true` exists only for isolated synthetic tests
on a non-production machine. Never set it in a deployed worker or admin
environment.

## Commands

All commands run from this directory after `pip install -e .`.

### Enroll (fixed embeddings, no training)

Use varied, recent, consented photos with one clear face each. The worker
requires 3–20 images and rejects images that are small, dark, bright, blurry, or
contain zero/multiple detected faces. It stores normalized embeddings and
source SHA-256 audit digests, but never copies the images or crops.

For biometric enrollment, an operator must first make the exact
admin-approved protected reference files available under an
`enrollment_root`. The CLI verifies their SHA-256 values against
`face_reference_assets`; it never fetches arbitrary storage keys or URLs. After
enrollment it registers only a template HMAC fingerprint, count, reference
hashes, model version, owner, and expiry in `face_template_sets`. Actual
embeddings and the HMAC key stay in the local store.

```powershell
core-face-analyzer enroll `
  --config config.local.json `
  --session review-vod-example `
  --identity example-member `
  --worker-id face-worker-local-01 `
  --image authorized-enrollment\front.jpg `
  --image authorized-enrollment\left.jpg `
  --image authorized-enrollment\right.jpg
```

Replacing an existing template is explicit:

```powershell
core-face-analyzer enroll --config config.local.json --session review-vod-example `
  --identity example-member `
  --replace --image authorized-enrollment\front-new.jpg `
  --image authorized-enrollment\left-new.jpg `
  --image authorized-enrollment\right-new.jpg
```

Replacement first deletes and exactly attests the old worker-owned template set
before activating the new one. If DB acknowledgement is unavailable, the old
local bytes remain deleted, a non-biometric retry tombstone remains, and the
new enrollment is refused until `sync-purges` succeeds. Duplicate reference
file contents are rejected even when supplied under different names.

Delete the original enrollment uploads according to the approved retention
policy after the admin workflow confirms enrollment; this CLI does not delete
operator-owned inputs.

### Analyze a controlled archive/VOD source

```powershell
core-face-analyzer analyze `
  --config config.local.json `
  --session review-vod-example `
  --start-ms 0 `
  --end-ms 3600000 `
  --max-frames 500
```

The NDJSON path comes from `runtime.event_output`; every row is a proposed event
at the container's actual media PTS. It contains normalized box geometry and,
only after threshold/margin/consensus, a configured identity ID. It contains no
display name, profile route, or social link; the web resolves those from its
canonical roster only after review and publication-consent checks.

### Analyze with manual, non-biometric tracking

Copy `fixtures/manual-tracks.example.json`, add admin-selected normalized
keyframes, and use a `manual` session:

```powershell
core-face-analyzer analyze `
  --config config.local.json `
  --session manual-vod-example `
  --manual-tracks fixtures\manual-tracks.example.json `
  --max-frames 500
```

Boxes are `[x, y, width, height]` in 0..1 media coordinates. Add keyframes when
a person moves or the shot cuts. `identity_id: null` emits an explicit Unknown
track without creating or comparing any biometric data.

Manual private tracking needs an active consent record but does not require
biometric or public-tag permission. Public display remains a separate web/DB
decision.

### Purge/revoke a local enrollment

Deletion never loads model files and remains available even when biometric
gates are off. It atomically removes the local embedding record and writes a
biometric-free local audit; if DB authority is reachable it also writes private
deletion metadata there. DB audit failure never rolls back the safety-critical
local deletion.

```powershell
core-face-analyzer purge-enrollment `
  --config config.local.json `
  --identity example-member `
  --reason "Subject revoked local biometric enrollment" `
  --worker-id face-worker-local-01
```

Stored consent expiry is enforced when templates are opened. Expired records
are deleted before matching/evaluation and audited. Revocation, disabled
permission, purge-pending template metadata, or a model/template fingerprint
mismatch deletes the exact local set during the next authority check. Raw
reference deletion after enrollment does not invalidate an active template set.

Poll revocation/expiry requests even while no analyzer is running:

```powershell
core-face-analyzer sync-purges --config config.local.json --worker-id face-worker-local-01
```

Deletion writes a private non-biometric tombstone before removing templates.
If the DB is down, `sync-purges` retries the exact worker/fingerprint
attestation later; a no-op or mismatched worker can never mark another set
purged.

### Evaluate before enabling public review

An evaluation manifest is NDJSON. The preferred real-data form points to a
held-out local image and includes the consented subject identity:

```json
{"sample_id":"alice-side-light","image":"alice/held-out-01.jpg","subject_identity_id":"alice","expected_identity_id":"alice"}
```

Image paths are resolved relative to the manifest and must still be within an
`enrollment_root`. A consenting negative tester can have
`expected_identity_id: null`, but their `subject_identity_id` must still be a
consented identity in the source/session allowlists. Synthetic vectors are
accepted for deterministic pipeline tests only and must say `"synthetic":true`.
Never persist a real person's embedding in an evaluation manifest.

```powershell
core-face-analyzer evaluate `
  --config config.local.json `
  --session review-vod-example `
  --start-ms 0 `
  --end-ms 3600000 `
  --manifest evaluation.jsonl
```

### Check honest end-to-end readiness

```powershell
core-face-analyzer status --config config.local.json --session review-vod-example `
  --start-ms 0 --end-ms 3600000
```

Add the exact requested `--start-ms` and `--end-ms` archive interval when
checking DB-integrated readiness. `ready_for_integrated_biometric_matching` is
never true from local files alone. It requires verified model digests,
non-expired local templates, both explicit gates, an exact consent PTS scope,
and a current DB template-set fingerprint/count/reference-hash attestation.
The output never includes embeddings or profile/social data.

Calibrate separately by camera/lighting. Before exposing reviewed tags, target
at least 99.5% proposal precision, review at least 20 hours in shadow mode, and
resolve every high-confidence false tag. Accuracy averages are not enough;
inspect errors across skin tones, presentation, pose, age, glasses, occlusion,
lighting, and camera quality.

### Import review proposals into local PostgreSQL

After migration `024_face_presence.sql` is applied, the bridge can submit
idempotent, short PTS proposals through the migration's reviewed worker RPCs.
It resolves configured canonical kind/slug pairs to the **current active DB
identity and consent**, checks source, exact archive scope, kill switch, mode,
and biometric allowlist, then submits only `proposed` or `unknown` rows. The RPC
writes its own immutable worker audit. It never approves or publishes and does
not send pixels, crops, embeddings, template data, display names, or handles.

Install the extra and use a dedicated loopback-only, least-privileged DB role:

```powershell
.venv\Scripts\python -m pip install -r requirements-db.txt
$env:FACE_ANALYZER_DATABASE_URL = "postgresql://core_face_worker:LOCAL_PASSWORD@127.0.0.1:56222/coreboys_media_ai"
$env:FACE_ANALYZER_WORKER_ID = "face-worker-local-01"
core-face-analyzer import-proposals `
  --config config.local.json `
  --session review-vod-example `
  --job-id 00000000-0000-0000-0000-000000000000 `
  --input .local-data\events.ndjson `
  --worker-id face-worker-local-01
```

The DB URL comes only from the process environment and must target localhost or
a literal loopback IP. It is never read from worker JSON or printed. `--input`,
if used, must stay under `runtime.data_dir`. See
[`DB_IMPORT.md`](DB_IMPORT.md) for restricted-role grants, source mapping,
aggregation/idempotency behavior, and rollback rules.

### Admin-reference integration boundary

The admin web process does not and should not read the local embedding file.
Approved uploads are intentionally **not ready** until an operator makes their
exact independently reviewed bytes available under an enrollment root and runs
`enroll`. The worker then activates `face_template_sets` metadata and audits the
sync. The backend reads that unexpired metadata—not raw reference approval—to
report readiness. Migration 024 contains no web-DB vector table.

### Execute an admin job

`run-job` asks the migration's restricted claim RPC for one archive/VOD job;
the RPC uses row locking, a renewable owner lease, stale-lease recovery, and
current DB authority. Cancellation/kill checks run at most one second apart
while frames flow. Job configuration must contain only
`startMs`, `endMs`, and optional `samplingFps`; it cannot supply a path or URL.
The worker maps DB `content_id` to exactly one protected local config source and
session. It imports only `proposed`/`unknown` rows and never approves or
publishes.

```powershell
core-face-analyzer run-job `
  --config config.local.json `
  --job-id 00000000-0000-0000-0000-000000000000 `
  --worker-id face-worker-local-01
```

For `manual_review`, put operator-authored keyframes at
`.local-data/manual-jobs/<job-id>.json`. Successful transient proposal NDJSON
is deleted immediately. A zero-face scan is a valid successful job.

### Run the worker service

The normal operator path is a supervised loop rather than periodic hand-run
commands:

```powershell
core-face-analyzer serve `
  --config config.local.json `
  --worker-id face-worker-local-01 `
  --poll-seconds 5
```

The loop claims one eligible job at a time, renews active leases, synchronizes
exact local template purge requests, retries signed purge tombstones, enforces
local retention, and publishes a fresh DB liveness heartbeat. The heartbeat is
`automatic_capable=true` and includes the SFace digest only when both biometric
environment gates and the verified YuNet/SFace files are ready. With biometrics
off it remains available for `manual_review`, purge, and retention work but
reports manual-only capability; admin biometric readiness therefore stays
degraded.
The claim RPC receives that capability and will not give an automatic archive
scan to a manual-only worker. Run this command under an OS service manager with
restart-on-failure and graceful-stop behavior.

The CLI holds a Windows/POSIX OS lock for the service lifetime. Stop the service
before running operator mutations such as `enroll` or `purge-enrollment`; a
second process is refused instead of risking a stale JSON overwrite. Store and
tombstone read-modify-write operations also reload under their own reentrant,
timeout-bounded lock, so a stale in-memory store cannot resurrect a purged
identity or discard another enrollment. Lock files contain only PID/purpose/time
metadata and may remain on disk after a clean stop; ownership itself is released
by the OS when the process exits.

`work-once` performs one queue poll for diagnostics. It returns a refusal when
no eligible job is available; an empty queue is normal for `serve`.

## Tests

The core tests use only the Python standard library and deterministic synthetic
vectors/boxes. They do not download or load model binaries:

```powershell
py -3.11 -m unittest discover -s tests -v
```

The model and PyAV paths are integration responsibilities because licensed
model files and test footage are intentionally not shipped.

## Data lifecycle

- Enrollment templates: local `.local-data/enrollments.json`, mode `0600` where
  supported; delete immediately on revocation and renew consent at least yearly.
- Enrollment photos: never copied by this worker; recommended admin upload
  retention is 24 hours after successful enrollment.
- Unknown/rejected pixels and embeddings: memory only; never included in logs,
  event NDJSON, or the enrollment store.
- Manual job keyframes: worker-owned review evidence deleted after 7 days by
  `cleanup-retention`.
- Proposal NDJSON: geometry, PTS, reasons, and identity IDs only; successful job
  batches are deleted immediately and failed diagnostics after 30 days.
- Audit logs: no biometrics; retain under the deployment's approved audit policy.

`serve` performs retention cleanup on every poll. If the service is not
installed yet, run `core-face-analyzer cleanup-retention --config
config.local.json` daily. Cleanup is limited to
`.local-data/manual-jobs/*.json` and `.local-data/job-proposals/*.ndjson`; the
worker never creates face crops.

The JSON template store is an MVP local format, not a claim of encryption at
rest. Protect the workstation account and volume. A hardened deployment should
move templates to an encrypted local secret store while retaining the existing
review-only, authenticated loopback proposal boundary.
