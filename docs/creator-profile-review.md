# Creator profile research and enrollment

`/admin/faces` can stage guests with social links, a provider profile picture,
dated research sources and review notes. The CORE member roster stays separate.
Use **Awaiting profile review** to find prepared guests. Check the linked accounts
and picture, add a note, then choose **Approve profile** or **Needs changes**.
Admins can correct channels and pictures in **Guest profile**. Editing a
researched profile returns it to review; a stale review cannot approve new edits.

Profile approval is separate from permission and face enrollment. It creates no
identity, consent, reference asset, template or public tag. Pending profiles are
blocked from consent creation/renewal and enrollment, and hidden from public face
profile lookup. Provider avatars never enter the recognition worker.

After approval, record the person's actual adult eligibility and permission,
including allowed purposes and expiry. Upload at least three distinct photos
the subject supplied or approved. A different admin must review the photos
before enrollment can be queued. Public tagging and automatic/live matching
remain controlled by their existing separate switches and content permissions.

## Researched photo candidates

The People & consent screen also shows privately stored **Reference photo
candidates** with their source pages and research notes. These files have no
consent, identity, enrollment or worker assignment. An admin must verify the
pictured person, a clear single face, the subject's approval of that exact photo,
and the image rights. Profile review and active adult template-creation permission
are required before **Submit for photo review** becomes available.

Submitting copies the exact researched bytes into the existing reference flow.
The same transaction checks the profile, consent, candidate owner, image hash and
pending state; it creates only a pending reference. A different admin still must
accept it in Enrollment. Submission and dismissal retire the research file;
hourly maintenance retries physical deletion if storage was unavailable. The
enrollment copy follows the existing consent and reference expiry policy.

Apply `063_face_photo_candidates.sql` with the web deployment. Import manifests
through `importPhotoCandidates` in `scripts/import-face-photo-candidates.mjs`
only after the normalized WebP files exist in protected reference storage.
The strict manifest accepts provenance and file metadata, and rejects approval,
consent or template fields. Imports are idempotent and preserve admin decisions.
The research manifest and images stay outside the public repository.

## Preparing a batch

Apply `062_face_profile_review.sql` through the normal web migration runner.
Prepare a private JSON array of `{ profile, research }` entries. `profile` follows
`FaceGuestProfileSchema`; `research` contains `checkedAt`, `sources` (label and
HTTPS URL), and `note`. Include provenance for provider profile images using
`avatarSourceProfile` and `avatarCheckedAt`. Do not include consent, approval or
embedding fields. Use existing guest IDs when a creator already exists elsewhere
in the directory, and do not guess accounts from handles alone.

With `DATABASE_URL` supplied privately by the deployment environment:

```sh
node scripts/import-face-profile-research.mjs /private/research.json owner@example.com
node scripts/import-face-profile-research.mjs /private/research.json owner@example.com --apply
```

The first command previews counts. Apply is transactional, stages new guests as
pending, attributes the request to the existing admin, and writes a system audit
entry. Existing profiles and their admin decisions are never overwritten.
The manifest stays outside the public repository. Production connections verify
TLS using system roots plus the bundled public Supabase CA.

## Validation

`pnpm test` covers URL validation, private metadata parsing, admin authorization,
same-origin review requests, and rejection of injected enrollment fields.
`node scripts/test-face-people-sql.mjs` checks persistence, stale decisions,
editing/review state changes, consent and enrollment gates, independent reference
review, public metadata isolation, and repeat-safe import in disposable PostgreSQL.
These checks do not establish recognition accuracy; that requires approved photos
and a permitted test recording.
