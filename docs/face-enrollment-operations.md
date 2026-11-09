Site enrollment operations

The website queues an enrollment after checking current adult template permission,
3–20 distinct independently approved reference photos and a fresh enrollment-capable
worker heartbeat. The worker claims it through restricted database functions,
checks the exact approved bytes, creates local SFace templates and reports completion.
Consent and reference approval are checked again before the website shows completion.
Unknown faces and public recognition are outside this enrollment operation.

Use `/admin/faces`: add/import a person, record template-creation permission,
upload 5–10 subject-approved JPEG/PNG/WebP photos, have a different admin approve
at least three, and select **Enroll approved photos**. The reviewer must also differ
from the person who recorded consent. Adding photos does not approve them automatically.
Template-only enrollment does not require a recording; permission for specific
recordings is added separately before analysis. Failed enrollment can be retried.

Azure runs one 0.5-vCPU/1-GiB worker with no public ingress. Its private reference
share is read-only; its separate template share is never mounted in the web app.
Both use persistent Azure Files storage. Web and worker images pin user/group
1001 to match the private volume mount permissions. The worker holds
the existing cross-process singleton/file locks. Rolling revisions must acquire
the same lock before processing. The database role cannot read arbitrary application
data or directly update jobs/templates. Hosted connections pin the configured host
and require `sslmode=verify-full` with the system CA certificate bundle. The anonymous
and authenticated Supabase API roles have no access to face tables or worker functions.

The image includes the public Supabase Root 2021 CA, obtained from the same
[official download URL](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt)
used by Supabase's dashboard. Its SHA-256 is
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
This public trust certificate contains no credentials. Certificate and hostname
verification remain enabled; `node scripts/provision-face-enrollment.mjs --check`
performs a read-only production connection check.

One-time bootstrap: build/push the worker image, set `FACE_DEPLOY_IMAGE` to its
versioned ACR name and run `node scripts/provision-face-enrollment.mjs --apply`.
The script reads existing Azure credentials in memory, provisions the restricted
database login and migrations 024/056/057, mounts private storage and starts the worker.
It never creates consent or reference photos. Subsequent main-branch worker changes
deploy through `.github/workflows/deploy-face-worker.yml`.

Web repository variables: `FACE_ANALYZER_ENABLED=true`,
`FACE_REFERENCE_UPLOADS_ENABLED=true`, `FACE_REFERENCE_STORAGE_DIR=/mnt/face-references`.
Keep `FACE_AUTOMATIC_MATCHING_ENABLED=false`, `FACE_PRESENCE_PUBLIC_ENABLED=false`
and `NEXT_PUBLIC_FACE_PRESENCE_UI_ENABLED=false` until actual recognition evaluation.
The worker separately sets `FACE_SITE_ENROLLMENT_ENABLED=true` and uses a restricted
database secret. Hourly retention runs remove expired reference files. Revoked
templates are purged by the worker. A stopped worker cannot claim new enrollment.

Cost estimate in USD, East US list rates retrieved November 8, 2026:
0.5 vCPU and 1 GiB for 730 hours costs approximately $11.83 at idle rates or $39.42
at continuous active rates, before any unused subscription free grant. Add storage,
transactions and logs; budget roughly $15–$45/month incremental for this initial
small enrollment service. This is an estimate, not a billing cap, and excludes the
existing web/database bill, taxes and future video/live processing. CPU rate is
$0.000024 active or $0.000003 idle per vCPU-second; memory is $0.000003/GiB-second.
[Azure pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/)
and the [Azure Retail Prices API](https://prices.azure.com/api/retail/prices).

The software and real models are tested without using anyone's photos. Synthetic
database/worker tests establish queue/approval correctness, not real face accuracy.
Real photos, subject permission and approved evaluation footage are required next.
