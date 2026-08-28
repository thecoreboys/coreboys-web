import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("social schedules call the canonical app and preserve useful failure bodies", () => {
  const streamWorkflow = read(".github/workflows/cron-stream-poll.yml");
  const workflows = [
    streamWorkflow,
    read(".github/workflows/cron-social-events.yml"),
    read(".github/workflows/cron-social-subscriptions.yml"),
  ];

  for (const workflow of workflows) {
    assert.match(workflow, /APP_URL: https:\/\/thecoreboys\.com/);
    assert.match(workflow, /METRICS_CRON_SECRET is not configured/);
    assert.match(workflow, /--fail-with-body/);
    assert.match(workflow, /--retry-all-errors/);
    assert.match(workflow, /concurrency:/);
  }

  assert.doesNotMatch(streamWorkflow, /METRICS_APP_URL/);
});

test("production deploy applies migrations and carries social delivery credentials", () => {
  const workflow = read(".github/workflows/deploy-azure.yml");

  assert.match(workflow, /pnpm db:apply-web-migrations/);
  assert.ok(
    workflow.indexOf("pnpm db:apply-web-migrations") < workflow.indexOf("az containerapp update"),
    "migrations must finish before the new revision is activated",
  );

  for (const name of [
    "FAN_OAUTH_KEY",
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
    "TWITCH_EVENTSUB_SECRET",
    "YOUTUBE_API_KEY",
    "YOUTUBE_WEBHOOK_SECRET",
    "YOUTUBE_WEBHOOK_VERIFY_TOKEN",
    "YOUTUBE_CHANNEL_IDS_JSON",
    "YOUTUBE_WEBHOOK_CHANNEL_OWNERS_JSON",
    "TIKTOK_CLIENT_KEY",
    "TIKTOK_CLIENT_SECRET",
    "TIKTOK_ACCOUNT_TOKENS_JSON",
    "INSTAGRAM_CLIENT_ID",
    "INSTAGRAM_CLIENT_SECRET",
    "INSTAGRAM_ACCOUNT_TOKENS_JSON",
    "META_APP_SECRET",
    "META_WEBHOOK_VERIFY_TOKEN",
    "SOCIAL_NOTIFICATIONS_DELIVERY_ENABLED",
    "SOCIAL_SUBSCRIPTION_CRON_SECRET",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
    "EMAIL_NOTIFICATIONS_ENABLED",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "RESEND_FROM_NAME",
    "RESEND_REPLY_TO_EMAIL",
  ]) {
    assert.match(
      workflow,
      new RegExp(`add_secret\\s+[a-z0-9-]+\\s+${name}\\b`),
      `${name} must be stored in Azure and referenced by the deployed revision`,
    );
  }
  for (const name of [
    "INSTAGRAM_API_MODE",
    "META_GRAPH_API_VERSION",
    "SOCIAL_NOTIFICATION_MAX_AGE_HOURS",
  ]) {
    assert.match(
      workflow,
      new RegExp(`"${name}=\\$\\{${name}\\}"`),
      `${name} must be supplied directly to the deployed revision`,
    );
  }
  assert.match(workflow, /SOCIAL_WEBHOOK_BASE_URL=https:\/\/thecoreboys\.com/);
});

test("production deploy provisions one durable scheduler per polling route", () => {
  const workflow = read(".github/workflows/deploy-azure.yml");
  const xFallback = read(".github/workflows/cron-x-feed.yml");
  const socialFallback = read(".github/workflows/cron-social-events.yml");

  assert.match(workflow, /az containerapp job (?:show|create|update)/);
  assert.match(workflow, /az containerapp job secret set/);
  assert.match(workflow, /--trigger-type Schedule/);
  assert.match(workflow, /--replica-retry-limit 2/);
  assert.match(workflow, /--replica-completion-count 1/);
  assert.match(workflow, /--parallelism 1/);
  assert.match(workflow, /coreboys-x-feed-cron/);
  assert.match(workflow, /coreboys-social-reconcile-cron/);
  assert.match(workflow, /2-59\/5 \* \* \* \*/);
  assert.match(workflow, /4-59\/10 \* \* \* \*/);
  assert.match(workflow, /CORE_CRON_SECRET=secretref:metrics-cron-secret/);
  assert.match(workflow, /CORE_CRON_TIMEOUT_MS=\$request_timeout_ms/);
  assert.match(workflow, /AbortSignal\.timeout\(timeout\)/);
  assert.match(workflow, /node:22-alpine@sha256:[0-9a-f]{64}/);
  assert.match(workflow, /actual_trigger[\s\S]*actual_cron[\s\S]*actual_state/);
  assert.match(xFallback, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(socialFallback, /cron: "\*\/10 \* \* \* \*"/);
});

test("subscription renewal and the deployed route share a dedicated-secret fallback", () => {
  const renew = read(".github/workflows/cron-social-subscriptions.yml");
  const deploy = read(".github/workflows/deploy-azure.yml");
  const route = read("app/api/social/subscriptions/provision/route.ts");

  for (const source of [renew, deploy, route]) {
    assert.match(source, /SOCIAL_SUBSCRIPTION_CRON_SECRET/);
    assert.match(source, /METRICS_CRON_SECRET/);
  }
});

test("YouTube listener renewal is bounded and retries transient hub failures", () => {
  const provisioner = read("lib/social-subscriptions.ts");

  assert.match(provisioner, /YOUTUBE_SUBSCRIPTION_CONCURRENCY = 4/);
  assert.match(provisioner, /YOUTUBE_SUBSCRIPTION_ATTEMPTS = 3/);
  assert.match(provisioner, /response\.status !== 429 && response\.status < 500/);
  assert.match(provisioner, /channels\.slice\(index, index \+ YOUTUBE_SUBSCRIPTION_CONCURRENCY\)/);
  assert.match(provisioner, /webhookState: "error"/);
});
