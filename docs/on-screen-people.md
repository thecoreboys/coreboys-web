# On-screen people: enrollment and current coverage

The creator directory at `/admin/media-intelligence` and the AI enrollment
controls at `/admin/faces` serve different steps. Directory entries and names
in captions do not establish visual identity. AI proposals require separately
approved reference photos, a configured analyzer and a human review.

## Production audit — November 8, 2026 (America/New_York)

Read-only Azure and production PostgreSQL inspection found:

- Web revision `coreboys-web--0000083`, image commit `99a3fc1`.
- Nine saved creators: the six CORE members plus Adin Ross, PlaqueBoyMax and YourRAGE.
- 7,891 draft creator annotations; zero published annotations.
- Zero face identities, current face consents, approved references, active
  template sets, face sources or registered worker heartbeats.
- No face analyzer app/job in `coreboys-prod`; the web app had only the face
  retention secret, with no recognition/public-presence/upload enable flags.
- The Azure build workflow omitted the public face-presence build argument,
  leaving its Docker default `false` compiled into the viewer.

These findings describe the deployed state before this change. No production
data, permissions, feature flags or infrastructure were changed by this audit.
Real-world recognition accuracy has not been measured: no approved faces or
test footage were configured in that deployment.

## Admin workflow

1. Open **On-screen people → People & consent**. Select **Use a saved creator**
   to import/refresh a guest's directory profile, or **Add friend or streamer**
   for a new recognition profile. CORE members and crew retain their profiles.
   Imported social links include Kick and other supported directory platforms.
   Imports copy profile metadata only; they never create consent or templates.
2. Record the person's actual template-creation permission. Permission for
   particular recordings and time intervals is added separately before matching.
3. Under **Enrollment**, upload approved reference photos and have a separate
   reviewer approve them. Select **Enroll approved photos** to queue the worker.
   Saving/approving uploads alone does not mark an identity ready; successful
   template creation is confirmed by the worker and database.
4. Add the exact Watch content ID under **Sources & jobs**, connect its original
   recording in worker configuration, and add eligible identities to its list.
5. Run a bounded archive scan. Review proposed matches, then publish explicitly.
   Unknown or ambiguous faces remain unnamed. Revocation immediately removes
   published presence and queues local template deletion.

The worker's `identity_registry: "database"` mode refreshes people and source
assignments from admin before jobs and during service polling. It keeps media
paths, model verification and session limits local. Existing local template IDs
are preserved; newly enrolled guests use their DB identity UUID. Registry
failure stops matching. Local template deletion still works during a DB outage.

## Processing cost and reuse

Open **Video review** in `/admin/faces` and select a saved archive source plus a
local video you are authorized to review. Chrome plays/seeks the file, fingerprints
its complete contents in 4-MiB chunks in a background worker, and generates up to
12 interval previews locally. Confirm the file matches the selected source, then
open/reuse its saved review. Videos and preview pixels are never uploaded. Only
small metadata and appearance labels go to the private database. Reopening the
same bytes, including a renamed file, restores labels; resaving the same mark
preserves its approved/rejected/published state. Named marks still require current
adult permission covering the complete recording interval. Human inputs remain
review proposals until separately approved and published; they do not retrain a
model or start an AI job.

YouTube/Twitch iframe players do not expose their cross-origin pixels to this
tool. This path uses authorized local files. Automatic facial matching remains
server-side, with private fixed-model templates; no embeddings or private
enrollment images are downloaded into viewers' browsers.

Server requests use an application-generated fingerprint of source/content ID,
protected recording locator, optional prepared-file fingerprint, interval,
sampling, pipeline version and current approved consent/template/model versions.
Random client request keys cannot force duplicate work. Concurrent identical
requests reuse one job, including queued, completed and failed jobs. Failed or
cancelled jobs require an explicit **Retry**; permission is rechecked. Human review
decisions are preserved. New settings, reference templates or source versions need
fresh work. Protected recording locators must name immutable recordings: when
replacing an input file, configure a new locator/version rather than overwriting
the old path. A matching local file can also supply a prepared-file fingerprint
through `browserReviewId`. A name/metadata cache cannot detect bytes overwritten
behind an unchanged protected locator.

The default is one sample every two seconds. Each server job is limited to 1,800
sampled frames and a two-hour interval, enforced independently by the API and
worker. The decoder seeks to the requested interval and stops at its end. Sparse
sampling can miss brief appearances; use smaller intervals with higher sampling
or human labels when necessary. Nothing starts an AI job merely because a viewer
opens a video. Existing media-description/caption analysis also reuses unchanged
content and analyzer versions. See [enrollment operations](face-enrollment-operations.md)
for on-demand worker costs and startup checks.

## Playback coverage

| Source | Recognition and display |
| --- | --- |
| YouTube videos, Shorts and recorded streams | Authorized original footage can be scanned; reviewed tags use the player timeline. |
| Twitch VODs | Authorized recordings can be scanned; reviewed tags use the VOD timeline. |
| Twitch clips | Authorized copies can be scanned. The official clip iframe has no reliable parent playback clock, so synchronized tags need a native video copy. |
| Native video | Scannable from configured local media; publication also requires an inspectable review link for its exact content ID. |
| TikTok/Instagram/other recordings | The worker can decode authorized video files; this is not a universal provider import/review integration. |
| Live streams | Live biometric matching is not implemented. Existing human-reviewed creator tags have separate timeline rules; Twitch live viewer watch time is not a broadcast timestamp. |

The viewer discards tags at their interval boundary and after seeking. Provider
tags require a recent real playback sample for the current content; resume
positions, guessed wall clocks and stale samples cannot identify a person.
AI presence uses the same `player.creator_tags` membership/complimentary-access
gate as the deployed creator panel and returns private, uncached responses.

## Deployment prerequisites

Apply migrations `056_face_guest_profiles.sql` and `057_face_site_enrollment.sql` using the normal web
migration runner. The existing media creator migrations remain required for
directory imports. No existing roster or face consent is backfilled.

Provision persistent protected reference storage shared by web replicas before
setting `FACE_REFERENCE_UPLOADS_ENABLED=true` and `FACE_REFERENCE_STORAGE_DIR`.
The Azure web image does not include the Python analyzer. Run the separate
worker with verified YuNet/SFace models, persistent local template storage,
approved references and authorized media. Database connections default to
loopback-only. The Azure deployment explicitly pins its hosted database name
and requires certificate and hostname verification. See
[site enrollment operations](face-enrollment-operations.md) for the separate
worker, private persistent shares, deployment and initial cost estimate.

The Azure workflow now passes repository variables for recognition, matching,
uploads, public presence and the public UI build switch. Defaults remain false.
`NEXT_PUBLIC_FACE_PRESENCE_UI_ENABLED` requires rebuilding the web image; changing
only a runtime environment variable cannot enable the compiled UI. These switches
are not a substitute for verified models, templates or a healthy worker.

## Verification

Run `pnpm exec tsx --test tests/face*.test.ts` and the Python worker suite.
`node scripts/test-face-people-sql.mjs` starts and removes its own local PostgreSQL
container; it verifies migration reapplication, guest persistence, duplicate
protection, restricted worker reads, reviewed YouTube/Twitch tag metadata,
interval boundaries, updates and revocation. It never connects to production,
uses no real reference photos, and makes no claim about model accuracy.
