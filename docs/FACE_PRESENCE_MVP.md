# Consent-first face presence MVP

Status: implementation pilot. Public tags and automatic matching must remain disabled until every launch gate in this document is complete.

This system answers one narrow question for authorized CORE video: **which specifically enrolled, consenting adult is likely on screen during this reviewed time range?** It is not open-world identification, surveillance, audience recognition, moderation evidence, authentication, liveness detection, or a way to infer age, emotion, ethnicity, health, or any other sensitive trait.

## Non-negotiable launch rules

1. Enroll only a known adult who completed the reviewed consent form for each enabled purpose.
2. Never enroll a person from social-media photos, screenshots, public streams, search results, or an admin's unilateral decision.
3. The v1 pilot is archive/VOD-only. Run matching only inside a bounded start/end interval on an exact CORE content ID covered by every allowlisted participant's immutable consent. Live matching stays disabled until a later session-bound consent design is separately approved. An allowlist does not prevent a model from scanning an unknown face, so all-visible consent and the global deployment gate still apply.
4. Use manual click-to-label plus ordinary non-biometric box tracking for IRL footage, crowds, surprise guests, or any uncontrolled source.
5. Keep an explicit Unknown result. Never force the nearest enrolled identity.
6. Require staff review before publication. `FACE_AUTOMATIC_MATCHING_ENABLED`, `FACE_PRESENCE_PUBLIC_ENABLED`, and `NEXT_PUBLIC_FACE_PRESENCE_UI_ENABLED` remain false during evaluation.
7. A revoked identity stops matching and publishing immediately, then enters the documented deletion workflow.
8. Never use a result for authentication, access, policing, moderation punishment, eligibility, or another adverse decision.

## Architecture

```text
authorized MP4 / creator-owned OBS analysis output
                    |
                    v
      local face-analyzer worker (CPU)
      - manual tracker OR YuNet + SFace
      - session consent allowlist
      - Unknown + temporal consensus
                    |
                    v
        protected PostgreSQL review data
                    |
            staff approve/publish
                    |
                    v
     public time-range presence metadata only
     {name, profile, socials, reviewed box/time}
                    |
          +---------+----------+
          |                    |
   native CORE video     Twitch/YouTube embed
   anchored tag overlay  adjacent profile chips
```

The browser never receives embeddings, reference images, evidence crops, raw similarity, or model internals. Twitch and YouTube iframe pixels are not accessible to the site. The worker analyzes only an authorized upstream creator feed or an authorized local/archive file.

## Free local stack

- FFmpeg for decoding and media presentation timestamps. Use an LGPL-only build unless the project deliberately accepts GPL obligations.
- OpenCV YuNet for face detection and landmarks.
- OpenCV SFace for aligned embeddings.
- A small IoU/appearance tracker (the worker can run its built-in tracker; Norfair is an optional BSD-3 alternative).
- Existing PostgreSQL for jobs, consent, references, tracks, and audit records. No vector database is needed for the small roster.
- A local Windows/Linux/macOS machine for continuous work. Serverless web instances must not run FFmpeg jobs.

Do not substitute bundled InsightFace pretrained packs without separately resolving their model license. The supplied packs are not the production default for this project.

## Identity and consent lifecycle

An identity references the canonical site subject (`member` or `crew` plus slug). Display name, portrait, profile URL, and social accounts are projected from the existing People data; the face system does not create a second editable profile.

Enrollment requires:

- verified identity and confirmation that the subject is at least 18;
- notice/policy version and signed/electronic acceptance timestamp;
- separate grants for template creation, VOD matching, public name/tag display, and public profile/social links (live matching is unavailable in v1);
- immutable authorized archive scopes containing an exact CORE content ID plus finite start/end media timestamps, and the expected retention term;
- 3–20 clear, consented, single-subject samples across ordinary lighting, front/three-quarter pose, glasses, and common on-stream appearance;
- a subject-accessible revocation route.

The admin control room must display the actual consent and indexing state. Environment keys or an uploaded portrait do not mean a person is enrolled.

## Matching policy

The worker does not fine-tune a per-person model. It detects, aligns, embeds, and retains several consented prototypes tied to the canonical identity.

Before generating a suggestion:

- reject tiny, blurred, badly exposed, heavily occluded, or multi-face enrollment samples;
- compare only against the active session allowlist;
- require a calibrated top-1 threshold and a separate top-1/top-2 margin;
- require temporal consensus, initially at least three matching observations out of five;
- stop/expire a tag after consecutive misses;
- store a reviewable track interval instead of per-frame result spam;
- represent any failure of these checks as Unknown.

Benchmark thresholds from model documentation are not production thresholds. Calibrate with held-out footage from every enrolled subject and consenting negative testers.

## Manual mode (default for uncontrolled footage)

Manual mode detects or lets an admin draw a person box, then tracks that ordinary visual box across nearby frames. The admin assigns the canonical identity. It does not create or compare face embeddings.

Use manual mode when:

- the footage is IRL, outdoors, a crowd, or a public venue;
- a surprise or unconsented guest could appear;
- the media owner cannot prove authorization for biometric analysis;
- automatic matching is disabled by the source kill switch;
- the evaluation threshold has not been passed.

## Source authorization and platform rules

- Future live phase (not authorized or implemented in v1): use only a second low-resolution OBS output or a creator-owned pre-platform feed. Never scrape public HLS playback.
- VOD: use an owner-uploaded/exported MP4 or an explicitly authorized media asset.
- Native CORE player: a reviewed tag may be anchored to its normalized box.
- Twitch/YouTube embeds: show clickable identity chips adjacent to the player. Do not cover or obscure the provider player.
- A visible label inside a Twitch/YouTube broadcast must be composed in OBS before broadcast. It will not be clickable; the site can provide adjacent profile links.

All recognition events use source media PTS, not an unstamped server wall clock. A viewer receives only the event whose interval matches the playback time they currently see.

## Suggested retention defaults

These are deliberately short operational defaults and require counsel review before collection starts:

| Data | Default |
| --- | --- |
| Unknown face crop/embedding | memory only; discard immediately |
| Rejected enrollment upload | delete immediately after rejection |
| Pending raw enrollment upload | delete within 7 days if independent QA has not completed |
| Accepted raw enrollment upload | reset retention at QA and delete within 24 hours, unless consent expires sooner |
| Review evidence crop | 7 days after decision |
| Match/audit diagnostics without crops | 30 days |
| Active face templates | 12 months, then affirmative renewal |
| Revoked identity | disable immediately; delete derived data on the verified deletion run |

Backups must expire on their normal bounded schedule, and restore procedures must not resurrect revoked templates. The deletion job records what was removed without preserving biometric values.

## Evaluation and launch gates

Public or automatic tagging is blocked until all of these are true:

- consent language and public privacy disclosure reviewed by qualified counsel;
- every enrolled and potentially visible person is an adult with current purpose-specific consent;
- authorized-source inventory and data-flow/retention map approved;
- model files and exact licenses pinned and checksummed;
- deletion and revocation tested, including caches and backups;
- staff access uses MFA-capable least privilege and every mutation is audited;
- held-out test set covers each subject, non-roster consenting people, lighting, pose, glasses, hats, camera quality, and skin-tone variation;
- review-only pilot covers at least 20 hours of representative footage;
- measured published-tag precision is at least 99.5%, with zero unresolved high-confidence identity swaps in the pilot;
- per-subject and cohort error review shows no unacceptable disparity;
- incident runbook and source/global kill switches are exercised;
- a staff member can correct, unpublish, and revoke a result quickly;
- `FACE_AUTOMATIC_MATCHING_ENABLED=true` is changed only after the automatic-suggestion gates pass;
- `FACE_PRESENCE_PUBLIC_ENABLED=true` and the separate compile-time
  `NEXT_PUBLIC_FACE_PRESENCE_UI_ENABLED=true` are changed only after the
  public-output gates pass.

If a gate later fails, disable the affected source or the global public flag and return to review-only mode.

## Operational sequence

1. Apply the face-presence database migration.
2. Keep public output and automatic matching off.
3. Create an identity from an existing canonical person and record purpose-specific consent.
4. After protected storage and staff-access review, deliberately enable `FACE_REFERENCE_UPLOADS_ENABLED`, upload consented references, and run local enrollment QA.
5. Register an authorized VOD source using its canonical Watch content ID.
6. Run the worker in manual mode first; review, correct, and approve tracks.
7. Only after the public-output gates pass, deliberately enable both public-presence flags and publish a small reviewed VOD test set. Verify native anchored tags and adjacent provider chips at exact playback times.
8. Run the evaluation harness and record the chosen per-model/per-session thresholds.
9. Only after the automatic-suggestion gates pass, deliberately enable the analyzer and automatic-matching flags and pilot automatic suggestions in review-only mode.
10. Keep live recognition disabled. A controlled live phase requires a separate session-consent design, legal review, implementation, and approval after the VOD gates pass.

## Incident response

If a wrong public identity appears, an unconsented person is scanned, an authorized feed is lost, or biometric material may be exposed:

1. Trigger the global/source kill switch.
2. Unpublish the affected tracks.
3. Preserve non-biometric audit evidence and record the incident; do not create new face crops.
4. Identify affected identities, sources, timestamps, systems, and recipients.
5. Revoke access tokens/DB credentials if relevant.
6. Run and verify deletion for unauthorized biometric data.
7. Notify the privacy owner and counsel; follow applicable incident-notification duties.
8. Do not re-enable matching until root cause and corrective tests are documented.

## Primary references

- [OpenCV YuNet model and license](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)
- [OpenCV SFace tutorial](https://docs.opencv.org/5.0/tutorials/dnn/dnn_face/dnn_face.html)
- [FFmpeg legal and licensing](https://ffmpeg.org/legal.html)
- [Twitch embeds](https://dev.twitch.tv/docs/embed/)
- [YouTube required minimum functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [Illinois Biometric Information Privacy Act](https://www.ilga.gov/legislation/ilcs/fulltext?DocName=074000140K15)
- [Texas Business & Commerce Code Chapter 503](https://statutes.capitol.texas.gov/Docs/BC/pdf/BC.503.pdf)
- [California Consumer Privacy Act](https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?division=3.&lawCode=CIV&part=4.&title=1.81.5)
- [FTC Rite Aid facial-recognition action](https://www.ftc.gov/news-events/news/press-releases/2023/12/rite-aid-banned-using-ai-facial-recognition-after)

This document is an engineering and product-control plan, not legal advice.
