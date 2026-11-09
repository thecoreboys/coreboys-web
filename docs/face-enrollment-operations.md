Site enrollment operations

The website queues an enrollment after checking current adult template permission,
3–20 distinct independently approved reference photos. A continuous worker needs
a fresh enrollment heartbeat; an on-demand worker is woken after the durable request
is saved. The worker claims it through restricted database functions,
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
versioned ACR name and run `node scripts/provision-face-enrollment.mjs --apply --on-demand`.
The script reads existing Azure credentials in memory, provisions the restricted
database login and migrations through 064, mounts private storage and starts the worker.
It never creates consent or reference photos. Subsequent main-branch worker changes
deploy through `.github/workflows/deploy-face-worker.yml`.

Web repository variables: `FACE_ANALYZER_ENABLED=true`,
`FACE_REFERENCE_UPLOADS_ENABLED=true`, `FACE_REFERENCE_STORAGE_DIR=/mnt/face-references`.
Keep `FACE_AUTOMATIC_MATCHING_ENABLED=false`, `FACE_PRESENCE_PUBLIC_ENABLED=false`
and `NEXT_PUBLIC_FACE_PRESENCE_UI_ENABLED=false` until actual recognition evaluation.
The worker separately sets `FACE_SITE_ENROLLMENT_ENABLED=true` and uses a restricted
database secret. Hourly retention runs remove expired reference files. Revoked
templates are purged by the worker. New enrollment and purge requests wake a sleeping
worker. Failed wake delivery preserves the database request and is retried by the
hourly retention task or the same admin action.

Cost estimate in USD, East US list rates verified November 9, 2026:
the on-demand worker uses zero replicas while idle, eliminating its idle compute
bill. At 0.5 vCPU and 1 GiB, active compute is approximately **$0.054 per worker
running hour**, before the shared subscription free grant. Ten active hours would
be $0.54; 100 hours would be $5.40. These are worker running hours, not recording
hours: speed depends on codec, interval, number of faces and sampling rate. Start-up
and shutdown time also count. Storage, queue transactions, logs, and the existing
website/database charges remain separate. There is no paid inference API or model
training call in this review/enrollment path. Chrome-only previews and human labels
start no worker; saving their small metadata still uses the website/database.
CPU rate is $0.000024 active per vCPU-second; memory is $0.000003/GiB-second.
[Azure pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/)
and the [Azure Retail Prices API](https://prices.azure.com/api/retail/prices).

On-demand provisioning adds only the `face-work` queue in the existing storage
account. The web identity can send messages to that queue. The worker identity can
read its length and process/delete messages. These roles are queue-scoped; neither
app receives an account key. Wake messages contain only `wake`. Database jobs stay
authoritative. The worker acknowledges old wake hints only after no eligible work,
running leases or required local-template purges remain. New hints racing this
probe are preserved. KEDA polls every 30 seconds and uses a 60-second cooldown;
cold starts can take a minute. A maximum of one replica and persistent singleton
locks serialize enrollment and scans. Image deployments preserve this scale rule.
To restore the previous always-running behavior, change the worker minimum replicas
to one; its queue configuration can remain intact. Do not roll back the additive
metadata migration or discard the persistent template share.

After deployment, use the authenticated retention route with `{"wakeWorker":true}`
as an empty-work startup probe. Verify a fresh enrollment heartbeat, an empty queue,
and automatic return to zero replicas. This probe must never create subject consent,
reference approval or a recognition job.

The software and real models are tested without using anyone's photos. Synthetic
database/worker tests establish queue/approval correctness, not real face accuracy.
Real photos, subject permission and approved evaluation footage are required next.
