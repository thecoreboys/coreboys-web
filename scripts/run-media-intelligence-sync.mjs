#!/usr/bin/env node

const baseUrl = (process.env.APP_URL || process.env.MEDIA_INTELLIGENCE_APP_URL || "").replace(/\/$/, "");
const secret = process.env.MEDIA_INTELLIGENCE_CRON_SECRET || process.env.METRICS_CRON_SECRET || "";
if (!baseUrl) throw new Error("APP_URL or MEDIA_INTELLIGENCE_APP_URL is required.");
if (!secret) throw new Error("MEDIA_INTELLIGENCE_CRON_SECRET or METRICS_CRON_SECRET is required.");

const response = await fetch(`${baseUrl}/api/media-intelligence/catalog-sync`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-media-intelligence-secret": secret,
  },
  body: JSON.stringify({
    action: process.env.MEDIA_INTELLIGENCE_CRON_ACTION || "maintenance",
    maxJobs: Number(process.env.MEDIA_INTELLIGENCE_SYNC_MAX_JOBS || 100),
    maxArchivePages: Number(process.env.MEDIA_INTELLIGENCE_ARCHIVE_MAX_PAGES || 8),
    archivePageSize: Number(process.env.MEDIA_INTELLIGENCE_ARCHIVE_PAGE_SIZE || 50),
    retentionLimit: Number(process.env.MEDIA_INTELLIGENCE_RETENTION_LIMIT || 250),
  }),
  signal: AbortSignal.timeout(300_000),
});
const body = await response.text();
if (!response.ok) throw new Error(`Media intelligence sync failed (${response.status}): ${body.slice(0, 500)}`);
process.stdout.write(`${body}\n`);
