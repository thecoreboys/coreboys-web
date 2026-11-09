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
2. Record the person's actual consent and approved video/time intervals.
3. Under **Enrollment**, upload approved reference photos and have a separate
   reviewer approve them. The operator enrolls their exact bytes in the local
   worker. Saving/approving uploads alone does not mark an identity ready.
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

Apply primary migration `056_face_guest_profiles.sql` using the normal web
migration runner. The existing media creator migrations remain required for
directory imports. No existing roster or face consent is backfilled.

Provision persistent protected reference storage shared by web replicas before
setting `FACE_REFERENCE_UPLOADS_ENABLED=true` and `FACE_REFERENCE_STORAGE_DIR`.
The Azure web image does not include the Python analyzer. Run the separate
worker with verified YuNet/SFace models, persistent local template storage,
approved references and authorized media. The worker currently requires its
database endpoint to be loopback-bound; a protected local proxy/tunnel to the
same authoritative database is required for hosted operation.

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
