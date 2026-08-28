import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import { socialNotificationMaxAgeMs } from "@/lib/social-event-normalization";
import {
  fetchSocialFetchInstagramPostsPage,
  fetchSocialFetchInstagramReelsPage,
  fetchSocialFetchTikTokVideosPage,
  fetchSocialFetchTwitterTweetsPage,
  type SocialFetchInstagramMedia,
  type SocialFetchPrivateMediaPageResult,
  type SocialFetchTikTokVideo,
  type SocialFetchTwitterTweet,
} from "@/lib/social-fetch-media";
import type { SocialEventInput } from "@/lib/social-events";
import { X_ROSTER_OWNERS } from "@/lib/x/roster";

const DEFAULT_MAX_CREDITS = 1_000;
const DEFAULT_MAX_PAGES_PER_RUN = 3;
const MAX_PAGES_PER_RUN = 12;
const MAX_PAGES_PER_TASK = 250;
const LEASE_SECONDS = 4 * 60;

export type SocialFetchBackfillProvider = "tiktok" | "instagram" | "twitter";
export type SocialFetchBackfillSurface = "videos" | "posts" | "reels" | "tweets";

export type SocialFetchBackfillTarget = {
  provider: SocialFetchBackfillProvider;
  surface: SocialFetchBackfillSurface;
  handle: string;
  memberSlug: string | null;
  accountLabel: string;
};

export type SocialFetchBackfillPageDecision =
  | { action: "complete"; reason: "provider_exhausted" | "cutoff_reached" }
  | { action: "continue"; nextCursor: string }
  | { action: "blocked"; reason: "missing_cursor" | "repeated_cursor" };

export type SocialFetchBackfillTaskStatus = SocialFetchBackfillTarget & {
  status: "pending" | "completed";
  cursor: string | null;
  pagesProcessed: number;
  creditsCommitted: number;
  itemsRecorded: number;
  completionReason: string | null;
  lastError: string | null;
};

export type SocialFetchBackfillStatus = {
  id: string;
  status: "running" | "paused" | "completed" | "cancelled";
  months: number;
  cutoffAt: string;
  backfillBeforeAt: string;
  maxCredits: number;
  creditsCommitted: number;
  creditsRemaining: number;
  pagesProcessed: number;
  itemsRecorded: number;
  pauseReason: string | null;
  lastError: string | null;
  totalTasks: number;
  completedTasks: number;
  tasks: SocialFetchBackfillTaskStatus[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type SocialFetchBackfillProcessResult = {
  status: "idle" | "processed" | "blocked" | "paused" | "completed";
  jobId: string | null;
  pagesProcessed: number;
  itemsRecorded: number;
  reason?: string;
};

type JobRow = {
  id: string;
  status: SocialFetchBackfillStatus["status"];
  months: number;
  cutoff_at: Date | string;
  backfill_before_at: Date | string;
  max_credits: number;
  credits_committed: number;
  pages_processed: number;
  items_recorded: number;
  pause_reason: string | null;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
};

type TaskRow = {
  id: string;
  job_id: string;
  provider: SocialFetchBackfillProvider;
  surface: SocialFetchBackfillSurface;
  handle: string;
  member_slug: string | null;
  account_label: string;
  cursor: string | null;
  attempt_token: string | null;
  attempt_started_at: Date | string | null;
  status: "pending" | "completed";
  completion_reason: string | null;
  pages_processed: number;
  credits_committed: number;
  items_recorded: number;
  last_error: string | null;
  seen_cursors: string[];
};

type JobLease = {
  id: string;
  token: string;
  cutoffAt: string;
  backfillBeforeAt: string;
};

type AcquireJobLeaseResult =
  | { kind: "lease"; lease: JobLease }
  | { kind: "paused"; jobId: string; reason: "uncertain_paid_page" }
  | { kind: "idle" };

type ReserveTaskResult =
  | { kind: "task"; task: TaskRow }
  | { kind: "completed" }
  | { kind: "paused"; reason: string }
  | { kind: "lost_lease" };

type BackfillPage = SocialFetchPrivateMediaPageResult<
  SocialFetchTikTokVideo | SocialFetchInstagramMedia | SocialFetchTwitterTweet
>;

type RecordEvent = (input: SocialEventInput) => Promise<{ id: string; created: boolean }>;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function finiteInteger(value: number, min: number, max: number, error: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(error);
  return value;
}

function guardedPageCredits(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : 1;
}

/** Worst-case documented base charge reserved before a provider call. */
export function socialFetchBackfillPageReservationCredits(
  provider: SocialFetchBackfillProvider,
): number {
  return provider === "twitter" ? 2 : 1;
}

function bareHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function boundedError(value: unknown): string {
  return (value instanceof Error ? value.message : String(value || "social_fetch_backfill_failed"))
    .trim()
    .slice(0, 500);
}

async function lockOwnedJob(client: PoolClient, lease: JobLease): Promise<void> {
  const owned = await client.query<{ id: string }>(
    `SELECT id::text FROM social_fetch_backfill_jobs
      WHERE id=$1 AND lease_token=$2 AND lease_until>now()
        AND status IN ('running','paused')
      FOR UPDATE`,
    [lease.id, lease.token],
  );
  if (!owned.rows[0]) throw new Error("social_fetch_backfill_lease_lost");
}

function orientation(
  dimensions: { width: number; height: number } | undefined,
  fallback: "landscape" | "portrait" | "square",
): "landscape" | "portrait" | "square" {
  if (!dimensions) return fallback;
  if (dimensions.height > dimensions.width) return "portrait";
  if (dimensions.width > dimensions.height) return "landscape";
  return "square";
}

/** Fixed seven-account scope: six members plus CORE across all four surfaces. */
export function socialFetchBackfillTargets(): SocialFetchBackfillTarget[] {
  const accounts: Array<{
    memberSlug: string | null;
    accountLabel: string;
    tiktok?: string;
    instagram?: string;
  }> = [{
    memberSlug: null,
    accountLabel: GROUP.name,
    tiktok: GROUP.socials.tiktok?.handle,
    instagram: GROUP.socials.instagram?.handle,
  }];
  for (const member of MEMBERS) {
    accounts.push({
      memberSlug: member.slug,
      accountLabel: member.stageName,
      tiktok: member.socials.find((social) => social.platform === "tiktok")?.handle,
      instagram: member.socials.find((social) => social.platform === "instagram")?.handle,
    });
  }

  const targets: SocialFetchBackfillTarget[] = [];
  for (const account of accounts) {
    if (account.tiktok) {
      const handle = bareHandle(account.tiktok);
      targets.push({
        provider: "tiktok",
        surface: "videos",
        handle,
        memberSlug: account.memberSlug,
        accountLabel: `${account.accountLabel} · @${handle}`,
      });
    }
    if (account.instagram) {
      const handle = bareHandle(account.instagram);
      for (const surface of ["posts", "reels"] as const) {
        targets.push({
          provider: "instagram",
          surface,
          handle,
          memberSlug: account.memberSlug,
          accountLabel: `${account.accountLabel} · @${handle}`,
        });
      }
    }
  }
  for (const owner of X_ROSTER_OWNERS) {
    if (!owner.handle) continue;
    const handle = bareHandle(owner.handle);
    targets.push({
      provider: "twitter",
      surface: "tweets",
      handle,
      memberSlug: owner.memberSlug,
      accountLabel: `${owner.ownerLabel} · @${handle}`,
    });
  }
  return targets;
}

/** Inclusive lower and exclusive fixed upper bound for historical rows. */
export function isInSocialFetchBackfillWindow(
  createdAt: string | null,
  cutoffAt: string | Date,
  backfillBeforeAt: string | Date,
): boolean {
  const created = Date.parse(createdAt ?? "");
  const cutoff = cutoffAt instanceof Date ? cutoffAt.getTime() : Date.parse(cutoffAt);
  const before = backfillBeforeAt instanceof Date
    ? backfillBeforeAt.getTime()
    : Date.parse(backfillBeforeAt);
  return Number.isFinite(created)
    && Number.isFinite(cutoff)
    && Number.isFinite(before)
    && created >= cutoff
    && created < before;
}

/** Calendar-month subtraction with end-of-month clamping, always in UTC. */
export function socialFetchBackfillBounds(
  startedAt: string | Date,
  months: number,
  notificationMaxAgeMs: number,
): { cutoffAt: string; backfillBeforeAt: string } {
  finiteInteger(months, 1, 24, "invalid_social_fetch_backfill_months");
  finiteInteger(
    notificationMaxAgeMs,
    0,
    7 * 24 * 60 * 60 * 1_000,
    "invalid_social_fetch_notification_window",
  );
  const start = startedAt instanceof Date ? new Date(startedAt) : new Date(startedAt);
  if (!Number.isFinite(start.getTime())) throw new Error("invalid_social_fetch_backfill_start");
  const monthIndex = start.getUTCFullYear() * 12 + start.getUTCMonth() - months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const cutoff = new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(start.getUTCDate(), lastTargetDay),
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  ));
  return {
    cutoffAt: cutoff.toISOString(),
    backfillBeforeAt: new Date(start.getTime() - notificationMaxAgeMs).toISOString(),
  };
}

/**
 * Cutoff completion requires every raw item to normalize to a timestamp older
 * than cutoff. Thus an old pinned item on a mixed page cannot stop the task.
 */
export function socialFetchBackfillPageDecision(input: {
  createdAts: readonly (string | null)[];
  rawItemCount: number;
  cutoffAt: string | Date;
  hasMore: boolean;
  currentCursor: string | null;
  nextCursor: string | null;
  seenCursors?: readonly string[];
}): SocialFetchBackfillPageDecision {
  if (!input.hasMore) return { action: "complete", reason: "provider_exhausted" };
  const cutoff = input.cutoffAt instanceof Date
    ? input.cutoffAt.getTime()
    : Date.parse(input.cutoffAt);
  const timestamps = input.createdAts.map((value) => Date.parse(value ?? ""));
  const wholeTimestampedPageIsOlder = Number.isFinite(cutoff)
    && input.rawItemCount > 0
    && timestamps.length === input.rawItemCount
    && timestamps.every((value) => Number.isFinite(value) && value < cutoff);
  if (wholeTimestampedPageIsOlder) {
    return { action: "complete", reason: "cutoff_reached" };
  }
  const nextCursor = input.nextCursor?.trim() || null;
  if (!nextCursor) return { action: "blocked", reason: "missing_cursor" };
  if (nextCursor === input.currentCursor || input.seenCursors?.includes(nextCursor)) {
    return { action: "blocked", reason: "repeated_cursor" };
  }
  return { action: "continue", nextCursor };
}

function tiktokEvent(target: SocialFetchBackfillTarget, item: SocialFetchTikTokVideo): SocialEventInput {
  return {
    provider: "tiktok",
    memberSlug: target.memberSlug,
    contentType: "short",
    canonicalId: `tiktok:${item.id}`,
    title: item.caption?.trim() || `${target.accountLabel} on TikTok`,
    body: target.accountLabel,
    href: item.sourceUrl,
    artworkUrl: item.thumbnailUrl ?? null,
    orientation: orientation(item.dimensions, "portrait"),
    publishedAt: item.createdAt!,
    platformPayload: {
      authorLabel: target.accountLabel,
      sourceUrl: item.sourceUrl,
      canonicalProviderId: item.id,
      embedUrl: `https://www.tiktok.com/player/v1/${item.id}`,
      mediaType: "video",
      format: "short",
      width: item.dimensions?.width,
      height: item.dimensions?.height,
      durationSeconds: item.durationSeconds,
    },
    notify: false,
  };
}

function instagramEvent(target: SocialFetchBackfillTarget, item: SocialFetchInstagramMedia): SocialEventInput {
  const isReel = item.surface === "reel" || /instagram\.com\/(?:reel|reels)\//i.test(item.sourceUrl);
  const isPhoto = !isReel && item.mediaType !== "video";
  return {
    provider: "instagram",
    memberSlug: target.memberSlug,
    contentType: isReel ? "short" : isPhoto ? "photo" : "video",
    canonicalId: `instagram:${item.id}`,
    title: item.caption?.trim() || `${target.accountLabel} on Instagram`,
    body: target.accountLabel,
    href: item.sourceUrl,
    artworkUrl: item.thumbnailUrl ?? null,
    orientation: orientation(item.dimensions, isReel ? "portrait" : "square"),
    publishedAt: item.createdAt!,
    platformPayload: {
      authorLabel: target.accountLabel,
      sourceUrl: item.sourceUrl,
      canonicalProviderId: item.id,
      embedUrl: item.embedUrl,
      mediaType: isPhoto ? "image" : "video",
      format: isPhoto ? "photo" : isReel ? "short" : "long",
      width: item.dimensions?.width,
      height: item.dimensions?.height,
    },
    notify: false,
  };
}

function twitterEvent(target: SocialFetchBackfillTarget, item: SocialFetchTwitterTweet): SocialEventInput {
  return {
    provider: "x",
    memberSlug: target.memberSlug,
    contentType: "post",
    canonicalId: `x:${item.id}`,
    title: item.text.trim() || `${target.accountLabel} on X`,
    body: target.accountLabel,
    href: item.sourceUrl,
    artworkUrl: item.thumbnailUrl ?? null,
    orientation: orientation(item.dimensions, item.mediaType === "photo" ? "square" : "landscape"),
    publishedAt: item.createdAt!,
    platformPayload: {
      authorLabel: target.accountLabel,
      sourceUrl: item.sourceUrl,
      canonicalProviderId: item.id,
      mediaType: item.mediaType === "photo" ? "image" : item.mediaType,
      format: item.mediaType === "photo" ? "photo" : undefined,
      width: item.dimensions?.width,
      height: item.dimensions?.height,
      isReply: item.isReply,
      isRetweet: item.isRetweet,
    },
    notify: false,
  };
}

/** Bounded persistence seam; dependency injection keeps safety tests DB-free. */
export async function persistSocialFetchBackfillPage(
  input: {
    target: SocialFetchBackfillTarget;
    items: readonly (SocialFetchTikTokVideo | SocialFetchInstagramMedia | SocialFetchTwitterTweet)[];
    cutoffAt: string | Date;
    backfillBeforeAt: string | Date;
  },
  dependencies: { recordEvent?: RecordEvent } = {},
): Promise<{ considered: number; created: number }> {
  const recordEvent = dependencies.recordEvent ?? (async (event: SocialEventInput) => {
    const { recordSocialEvent } = await import("@/lib/social-events");
    return recordSocialEvent(event);
  });
  let considered = 0;
  let created = 0;
  for (const item of input.items) {
    if (!isInSocialFetchBackfillWindow(
      item.createdAt,
      input.cutoffAt,
      input.backfillBeforeAt,
    )) continue;
    if (input.target.provider === "twitter") {
      const tweet = item as SocialFetchTwitterTweet;
      // Match the official current X snapshot: authored posts only, excluding
      // replies and engagement retweets.
      if (tweet.isReply || tweet.isRetweet) continue;
    }
    considered += 1;
    const event = input.target.provider === "tiktok"
      ? tiktokEvent(input.target, item as SocialFetchTikTokVideo)
      : input.target.provider === "instagram"
        ? instagramEvent(input.target, item as SocialFetchInstagramMedia)
        : twitterEvent(input.target, item as SocialFetchTwitterTweet);
    const result = await recordEvent({ ...event, notify: false });
    if (result.created) created += 1;
  }
  return { considered, created };
}

function statusTask(row: TaskRow): SocialFetchBackfillTaskStatus {
  return {
    provider: row.provider,
    surface: row.surface,
    handle: row.handle,
    memberSlug: row.member_slug,
    accountLabel: row.account_label,
    status: row.status,
    cursor: row.cursor,
    pagesProcessed: row.pages_processed,
    creditsCommitted: row.credits_committed,
    itemsRecorded: row.items_recorded,
    completionReason: row.completion_reason,
    lastError: row.last_error,
  };
}

async function getStatus(jobId?: string): Promise<SocialFetchBackfillStatus | null> {
  const jobs = await query<JobRow>(
    `SELECT id::text,status,months,cutoff_at,backfill_before_at,max_credits,credits_committed,
            pages_processed,items_recorded,pause_reason,last_error,created_at,updated_at,completed_at
       FROM social_fetch_backfill_jobs
      ${jobId ? "WHERE id = $1" : ""}
      ORDER BY CASE WHEN status IN ('running','paused') THEN 0 ELSE 1 END,created_at DESC
      LIMIT 1`,
    jobId ? [jobId] : [],
  );
  const job = jobs.rows[0];
  if (!job) return null;
  const tasks = await query<TaskRow>(
    `SELECT id::text,job_id::text,provider,surface,handle,member_slug,account_label,cursor,seen_cursors,
            attempt_token::text,attempt_started_at,status,
            completion_reason,pages_processed,credits_committed,items_recorded,last_error
       FROM social_fetch_backfill_tasks WHERE job_id=$1
      ORDER BY member_slug NULLS FIRST,provider,surface`,
    [job.id],
  );
  const taskStatuses = tasks.rows.map(statusTask);
  return {
    id: job.id,
    status: job.status,
    months: job.months,
    cutoffAt: iso(job.cutoff_at),
    backfillBeforeAt: iso(job.backfill_before_at),
    maxCredits: job.max_credits,
    creditsCommitted: job.credits_committed,
    creditsRemaining: Math.max(0, job.max_credits - job.credits_committed),
    pagesProcessed: job.pages_processed,
    itemsRecorded: job.items_recorded,
    pauseReason: job.pause_reason,
    lastError: job.last_error,
    totalTasks: taskStatuses.length,
    completedTasks: taskStatuses.filter((task) => task.status === "completed").length,
    tasks: taskStatuses,
    createdAt: iso(job.created_at),
    updatedAt: iso(job.updated_at),
    completedAt: job.completed_at ? iso(job.completed_at) : null,
  };
}

export function getSocialFetchBackfillStatus(): Promise<SocialFetchBackfillStatus | null> {
  return getStatus();
}

export async function startSocialFetchBackfill(input: {
  actorId: string;
  months: number;
  maxCredits?: number;
}): Promise<SocialFetchBackfillStatus> {
  const months = finiteInteger(input.months, 1, 24, "invalid_social_fetch_backfill_months");
  const maxCredits = finiteInteger(
    input.maxCredits ?? DEFAULT_MAX_CREDITS,
    1,
    100_000,
    "invalid_social_fetch_backfill_credit_cap",
  );
  const freshnessMs = finiteInteger(
    Math.ceil(socialNotificationMaxAgeMs()),
    0,
    7 * 24 * 60 * 60 * 1_000,
    "invalid_social_fetch_notification_window",
  );
  const startedAt = new Date();
  const bounds = socialFetchBackfillBounds(startedAt, months, freshnessMs);
  const jobId = randomUUID();
  const targets = socialFetchBackfillTargets();
  if (targets.length !== 28) throw new Error("social_fetch_backfill_roster_incomplete");

  await withTransaction(async (client) => {
    const active = await client.query<{ id: string }>(
      `SELECT id::text FROM social_fetch_backfill_jobs
        WHERE status IN ('running','paused')
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    );
    if (active.rows[0]) throw new Error("social_fetch_backfill_active");
    await client.query(
      `INSERT INTO social_fetch_backfill_jobs
        (id,status,months,cutoff_at,backfill_before_at,max_credits,started_by,updated_by,
         created_at,updated_at)
       VALUES ($1,'running',$2,$5,$6,$3,$4,$4,$7,$7)`,
      [
        jobId,
        months,
        maxCredits,
        input.actorId,
        bounds.cutoffAt,
        bounds.backfillBeforeAt,
        startedAt.toISOString(),
      ],
    );
    for (const target of targets) {
      await client.query(
        `INSERT INTO social_fetch_backfill_tasks
          (job_id,provider,surface,handle,member_slug,account_label)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [jobId, target.provider, target.surface, target.handle, target.memberSlug, target.accountLabel],
      );
    }
  });

  const status = await getStatus(jobId);
  if (!status) throw new Error("social_fetch_backfill_unavailable");
  return status;
}

export async function pauseSocialFetchBackfill(input: { actorId: string }): Promise<SocialFetchBackfillStatus> {
  const result = await query<{ id: string }>(
    `UPDATE social_fetch_backfill_jobs
        SET status='paused',pause_reason='admin_paused',updated_by=$1,updated_at=now()
      WHERE id=(SELECT id FROM social_fetch_backfill_jobs WHERE status='running'
                ORDER BY created_at DESC LIMIT 1)
      RETURNING id::text`,
    [input.actorId],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("social_fetch_backfill_not_running");
  const status = await getStatus(id);
  if (!status) throw new Error("social_fetch_backfill_unavailable");
  return status;
}

export async function resumeSocialFetchBackfill(input: {
  actorId: string;
  maxCredits?: number;
}): Promise<SocialFetchBackfillStatus> {
  let jobId: string | null = null;
  await withTransaction(async (client) => {
    const paused = await client.query<{
      id: string;
      credits_committed: number;
      max_credits: number;
      lease_token: string | null;
      lease_until: Date | string | null;
    }>(
      `SELECT id::text,credits_committed,max_credits,lease_token::text,lease_until
         FROM social_fetch_backfill_jobs
        WHERE status='paused' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    );
    const job = paused.rows[0];
    if (!job) throw new Error("social_fetch_backfill_not_paused");
    const maxCredits = input.maxCredits === undefined
      ? job.max_credits
      : finiteInteger(input.maxCredits, 1, 100_000, "invalid_social_fetch_backfill_credit_cap");
    if (maxCredits < job.credits_committed) throw new Error("social_fetch_backfill_cap_below_usage");
    const leaseUntil = job.lease_until ? new Date(job.lease_until).getTime() : 0;
    if (job.lease_token && Number.isFinite(leaseUntil) && leaseUntil > Date.now()) {
      throw new Error("social_fetch_backfill_worker_active");
    }
    // A stale attempt may have reached the provider before its worker died.
    // Only an explicit admin resume authorizes retrying that saved cursor.
    await client.query(
      `UPDATE social_fetch_backfill_tasks
          SET attempt_token=NULL,attempt_started_at=NULL,updated_at=now()
        WHERE job_id=$1 AND attempt_token IS NOT NULL`,
      [job.id],
    );
    await client.query(
      `UPDATE social_fetch_backfill_jobs
          SET status='running',max_credits=$2,pause_reason=NULL,last_error=NULL,
              lease_token=NULL,lease_until=NULL,updated_by=$3,updated_at=now()
        WHERE id=$1`,
      [job.id, maxCredits, input.actorId],
    );
    jobId = job.id;
  });
  if (!jobId) throw new Error("social_fetch_backfill_unavailable");
  const status = await getStatus(jobId);
  if (!status) throw new Error("social_fetch_backfill_unavailable");
  return status;
}

async function acquireJobLease(): Promise<AcquireJobLeaseResult> {
  const token = randomUUID();
  return withTransaction(async (client) => {
    const jobs = await client.query<{
      id: string;
      cutoff_at: Date | string;
      backfill_before_at: Date | string;
    }>(
      `SELECT id::text,cutoff_at,backfill_before_at
         FROM social_fetch_backfill_jobs
        WHERE status='running' AND (lease_until IS NULL OR lease_until<=now())
        ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const job = jobs.rows[0];
    if (!job) return { kind: "idle" as const };

    const uncertain = await client.query<{ id: string }>(
      `SELECT id::text FROM social_fetch_backfill_tasks
        WHERE job_id=$1 AND attempt_token IS NOT NULL
        ORDER BY attempt_started_at NULLS FIRST,id LIMIT 1 FOR UPDATE`,
      [job.id],
    );
    if (uncertain.rows[0]) {
      await client.query(
        `UPDATE social_fetch_backfill_jobs
            SET status='paused',pause_reason='uncertain_paid_page',last_error='uncertain_paid_page',
                lease_token=NULL,lease_until=NULL,updated_at=now()
          WHERE id=$1`,
        [job.id],
      );
      return { kind: "paused" as const, jobId: job.id, reason: "uncertain_paid_page" as const };
    }

    await client.query(
      `UPDATE social_fetch_backfill_jobs
          SET lease_token=$2,lease_until=now()+($3::int*interval '1 second'),updated_at=now()
        WHERE id=$1`,
      [job.id, token, LEASE_SECONDS],
    );
    return {
      kind: "lease" as const,
      lease: {
        id: job.id,
        token,
        cutoffAt: iso(job.cutoff_at),
        backfillBeforeAt: iso(job.backfill_before_at),
      },
    };
  });
}

async function reserveNextTask(lease: JobLease): Promise<ReserveTaskResult> {
  return withTransaction(async (client) => {
    const jobs = await client.query<{ max_credits: number; credits_committed: number }>(
      `SELECT max_credits,credits_committed FROM social_fetch_backfill_jobs
        WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND status='running' FOR UPDATE`,
      [lease.id, lease.token],
    );
    const job = jobs.rows[0];
    if (!job) return { kind: "lost_lease" as const };
    const tasks = await client.query<TaskRow>(
      `SELECT id::text,job_id::text,provider,surface,handle,member_slug,account_label,cursor,seen_cursors,
              attempt_token::text,attempt_started_at,status,
              completion_reason,pages_processed,credits_committed,items_recorded,last_error
         FROM social_fetch_backfill_tasks
        WHERE job_id=$1 AND status='pending' AND attempt_token IS NULL
        ORDER BY (last_error IS NOT NULL),last_attempt_at NULLS FIRST,id
        LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [lease.id],
    );
    const task = tasks.rows[0];
    if (!task) {
      await client.query(
        `UPDATE social_fetch_backfill_jobs SET status='completed',completed_at=now(),
                lease_token=NULL,lease_until=NULL,updated_at=now()
          WHERE id=$1 AND lease_token=$2`,
        [lease.id, lease.token],
      );
      return { kind: "completed" as const };
    }
    const reservedCredits = socialFetchBackfillPageReservationCredits(task.provider);
    if (job.credits_committed + reservedCredits > job.max_credits) {
      await client.query(
        `UPDATE social_fetch_backfill_jobs
            SET status='paused',pause_reason='job_credit_cap_reached',updated_at=now()
          WHERE id=$1 AND lease_token=$2`,
        [lease.id, lease.token],
      );
      return { kind: "paused" as const, reason: "job_credit_cap_reached" };
    }
    if (task.pages_processed >= MAX_PAGES_PER_TASK) {
      await client.query(
        `UPDATE social_fetch_backfill_jobs
            SET status='paused',pause_reason='task_page_cap_reached',last_error='task_page_cap_reached',
                updated_at=now() WHERE id=$1 AND lease_token=$2`,
        [lease.id, lease.token],
      );
      return { kind: "paused" as const, reason: "task_page_cap_reached" };
    }
    await client.query(
      `UPDATE social_fetch_backfill_jobs
          SET credits_committed=credits_committed+$4,
              lease_until=now()+($3::int*interval '1 second'),updated_at=now()
        WHERE id=$1 AND lease_token=$2`,
      [lease.id, lease.token, LEASE_SECONDS, reservedCredits],
    );
    const attempt = await client.query(
      `UPDATE social_fetch_backfill_tasks
          SET attempt_token=$3,attempt_started_at=now(),last_attempt_at=now(),
              last_error=NULL,updated_at=now()
        WHERE id=$1 AND job_id=$2 AND attempt_token IS NULL`,
      [task.id, lease.id, lease.token],
    );
    if (attempt.rowCount !== 1) throw new Error("social_fetch_backfill_task_lost");
    return { kind: "task" as const, task };
  });
}

async function releaseZeroCallReservation(lease: JobLease, task: TaskRow, error: string) {
  const reservedCredits = socialFetchBackfillPageReservationCredits(task.provider);
  await withTransaction(async (client) => {
    await lockOwnedJob(client, lease);
    await client.query(
      `UPDATE social_fetch_backfill_jobs
          SET credits_committed=GREATEST(0,credits_committed-$4),last_error=$3,updated_at=now()
        WHERE id=$1 AND lease_token=$2`,
      [lease.id, lease.token, error, reservedCredits],
    );
    const taskUpdate = await client.query(
      `UPDATE social_fetch_backfill_tasks
          SET attempt_token=NULL,attempt_started_at=NULL,last_error=$3,updated_at=now()
        WHERE id=$1 AND job_id=$2 AND attempt_token=$4`,
      [task.id, lease.id, error, lease.token],
    );
    if (taskUpdate.rowCount !== 1) throw new Error("social_fetch_backfill_task_lost");
  });
}

async function markPageFailure(
  lease: JobLease,
  task: TaskRow,
  error: string,
  reportedCredits = socialFetchBackfillPageReservationCredits(task.provider),
) {
  const committedCredits = guardedPageCredits(reportedCredits);
  const reservedCredits = socialFetchBackfillPageReservationCredits(task.provider);
  await withTransaction(async (client) => {
    await lockOwnedJob(client, lease);
    const taskUpdate = await client.query(
      `UPDATE social_fetch_backfill_tasks
          SET pages_processed=pages_processed+1,credits_committed=credits_committed+$4,
              attempt_token=NULL,attempt_started_at=NULL,last_error=$3,updated_at=now()
        WHERE id=$1 AND job_id=$2 AND attempt_token=$5`,
      [task.id, lease.id, error, committedCredits, lease.token],
    );
    if (taskUpdate.rowCount !== 1) throw new Error("social_fetch_backfill_task_lost");
    await client.query(
      `UPDATE social_fetch_backfill_jobs
          SET status='paused',pause_reason=$3,pages_processed=pages_processed+1,
              credits_committed=credits_committed+($4::int-$5::int),last_error=$3,updated_at=now()
        WHERE id=$1 AND lease_token=$2`,
      [lease.id, lease.token, error, committedCredits, reservedCredits],
    );
  });
}

async function applyPageSuccess(input: {
  lease: JobLease;
  task: TaskRow;
  decision: SocialFetchBackfillPageDecision;
  nextCursor: string | null;
  created: number;
  reportedCredits: number;
}): Promise<{ status: "running" | "paused" | "completed"; reason: string | null }> {
  const committedCredits = guardedPageCredits(input.reportedCredits);
  const reservedCredits = socialFetchBackfillPageReservationCredits(input.task.provider);
  return withTransaction(async (client) => {
    await lockOwnedJob(client, input.lease);
    let taskUpdate;
    if (input.decision.action === "continue") {
      taskUpdate = await client.query(
        `UPDATE social_fetch_backfill_tasks SET cursor=$2,seen_cursors=array_append(seen_cursors,$2),
                pages_processed=pages_processed+1,
                credits_committed=credits_committed+$4,items_recorded=items_recorded+$3,
                attempt_token=NULL,attempt_started_at=NULL,last_error=NULL,updated_at=now()
          WHERE id=$1 AND job_id=$5 AND attempt_token=$6`,
        [
          input.task.id,
          input.decision.nextCursor,
          input.created,
          committedCredits,
          input.lease.id,
          input.lease.token,
        ],
      );
    } else if (input.decision.action === "complete") {
      taskUpdate = await client.query(
        `UPDATE social_fetch_backfill_tasks SET status='completed',completion_reason=$2,
                cursor=COALESCE($5,cursor),
                seen_cursors=CASE
                  WHEN $5::text IS NULL OR $5=ANY(seen_cursors) THEN seen_cursors
                  ELSE array_append(seen_cursors,$5)
                END,
                pages_processed=pages_processed+1,credits_committed=credits_committed+$4,
                items_recorded=items_recorded+$3,attempt_token=NULL,attempt_started_at=NULL,
                last_error=NULL,completed_at=now(),updated_at=now()
          WHERE id=$1 AND job_id=$6 AND attempt_token=$7`,
        [
          input.task.id,
          input.decision.reason,
          input.created,
          committedCredits,
          input.nextCursor,
          input.lease.id,
          input.lease.token,
        ],
      );
    } else {
      taskUpdate = await client.query(
        `UPDATE social_fetch_backfill_tasks SET pages_processed=pages_processed+1,
                credits_committed=credits_committed+$4,items_recorded=items_recorded+$3,
                attempt_token=NULL,attempt_started_at=NULL,last_error=$2,updated_at=now()
          WHERE id=$1 AND job_id=$5 AND attempt_token=$6`,
        [
          input.task.id,
          input.decision.reason,
          input.created,
          committedCredits,
          input.lease.id,
          input.lease.token,
        ],
      );
    }
    if (taskUpdate.rowCount !== 1) throw new Error("social_fetch_backfill_task_lost");
    const remaining = await client.query<{ has_pending: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM social_fetch_backfill_tasks WHERE job_id=$1 AND status='pending'
       ) AS has_pending`,
      [input.lease.id],
    );
    const allTasksCompleted = remaining.rows[0]?.has_pending === false;
    const forcedPauseReason = input.decision.action === "blocked" ? input.decision.reason : null;
    const jobUpdate = await client.query<{
      status: "running" | "paused" | "completed";
      pause_reason: string | null;
    }>(
      `UPDATE social_fetch_backfill_jobs
          SET credits_committed=credits_committed+($4::int-$7::int),
              pages_processed=pages_processed+1,items_recorded=items_recorded+$3,
              status=CASE
                WHEN $6 AND credits_committed+($4::int-$7::int) <= max_credits THEN 'completed'
                WHEN $5::text IS NOT NULL THEN 'paused'
                WHEN credits_committed+($4::int-$7::int) >= max_credits THEN 'paused'
                ELSE status
              END,
              pause_reason=CASE
                WHEN $6 AND credits_committed+($4::int-$7::int) <= max_credits THEN NULL
                WHEN $5::text IS NOT NULL THEN $5
                WHEN credits_committed+($4::int-$7::int) > max_credits THEN 'job_credit_cap_exceeded'
                WHEN credits_committed+($4::int-$7::int) = max_credits THEN 'job_credit_cap_reached'
                ELSE pause_reason
              END,
              last_error=CASE
                WHEN $6 AND credits_committed+($4::int-$7::int) <= max_credits THEN NULL
                WHEN $5::text IS NOT NULL THEN $5
                WHEN credits_committed+($4::int-$7::int) > max_credits THEN 'job_credit_cap_exceeded'
                WHEN credits_committed+($4::int-$7::int) = max_credits THEN 'job_credit_cap_reached'
                ELSE last_error
              END,
              completed_at=CASE
                WHEN $6 AND credits_committed+($4::int-$7::int) <= max_credits THEN now()
                ELSE completed_at
              END,
              updated_at=now()
        WHERE id=$1 AND lease_token=$2
        RETURNING status,pause_reason`,
      [
        input.lease.id,
        input.lease.token,
        input.created,
        committedCredits,
        forcedPauseReason,
        allTasksCompleted,
        reservedCredits,
      ],
    );
    const job = jobUpdate.rows[0];
    if (!job) throw new Error("social_fetch_backfill_lease_lost");
    return { status: job.status, reason: job.pause_reason };
  });
}

async function fetchTaskPage(task: TaskRow): Promise<BackfillPage> {
  if (task.provider === "tiktok") {
    return fetchSocialFetchTikTokVideosPage(task.handle, task.cursor);
  }
  if (task.provider === "twitter") {
    return fetchSocialFetchTwitterTweetsPage(task.handle, task.cursor);
  }
  return task.surface === "reels"
    ? fetchSocialFetchInstagramReelsPage(task.handle, task.cursor)
    : fetchSocialFetchInstagramPostsPage(task.handle, task.cursor);
}

async function releaseJobLease(lease: JobLease) {
  await query(
    `UPDATE social_fetch_backfill_jobs SET lease_token=NULL,lease_until=NULL,updated_at=now()
      WHERE id=$1 AND lease_token=$2`,
    [lease.id, lease.token],
  );
}

/** Advance a small bounded batch from the authenticated social reconcile cron. */
export async function processSocialFetchBackfill(
  input: { maxPages?: number } = {},
): Promise<SocialFetchBackfillProcessResult> {
  const maxPages = finiteInteger(
    input.maxPages ?? DEFAULT_MAX_PAGES_PER_RUN,
    1,
    MAX_PAGES_PER_RUN,
    "invalid_social_fetch_backfill_page_limit",
  );
  const acquired = await acquireJobLease();
  if (acquired.kind === "idle") {
    return { status: "idle", jobId: null, pagesProcessed: 0, itemsRecorded: 0 };
  }
  if (acquired.kind === "paused") {
    return {
      status: "paused",
      jobId: acquired.jobId,
      pagesProcessed: 0,
      itemsRecorded: 0,
      reason: acquired.reason,
    };
  }
  const lease = acquired.lease;
  let pagesProcessed = 0;
  let itemsRecorded = 0;

  try {
    while (pagesProcessed < maxPages) {
      const reserved = await reserveNextTask(lease);
      if (reserved.kind === "completed") {
        return { status: "completed", jobId: lease.id, pagesProcessed, itemsRecorded };
      }
      if (reserved.kind === "paused") {
        return { status: "paused", jobId: lease.id, pagesProcessed, itemsRecorded, reason: reserved.reason };
      }
      if (reserved.kind === "lost_lease") {
        return { status: "blocked", jobId: lease.id, pagesProcessed, itemsRecorded, reason: "lease_lost" };
      }
      const task = reserved.task;
      let page: BackfillPage;
      try {
        page = await fetchTaskPage(task);
      } catch (error) {
        const message = boundedError(error);
        await markPageFailure(lease, task, message);
        pagesProcessed += 1;
        return { status: "paused", jobId: lease.id, pagesProcessed, itemsRecorded, reason: message };
      }

      if (!page.providerRequestMade) {
        const reason = page.budgetDenied ? "budget_denied" : `provider_${page.status}`;
        await releaseZeroCallReservation(lease, task, reason);
        return { status: "blocked", jobId: lease.id, pagesProcessed, itemsRecorded, reason };
      }
      if (page.status !== "ok") {
        const reason = `provider_${page.status}`;
        await markPageFailure(lease, task, reason, page.committedCredits);
        pagesProcessed += 1;
        return { status: "paused", jobId: lease.id, pagesProcessed, itemsRecorded, reason };
      }

      const target: SocialFetchBackfillTarget = {
        provider: task.provider,
        surface: task.surface,
        handle: task.handle,
        memberSlug: task.member_slug,
        accountLabel: task.account_label,
      };
      let persisted: { considered: number; created: number };
      try {
        persisted = await persistSocialFetchBackfillPage({
          target,
          items: page.items,
          cutoffAt: lease.cutoffAt,
          backfillBeforeAt: lease.backfillBeforeAt,
        });
      } catch (error) {
        const message = boundedError(error);
        await markPageFailure(lease, task, message, page.committedCredits);
        pagesProcessed += 1;
        return { status: "paused", jobId: lease.id, pagesProcessed, itemsRecorded, reason: message };
      }
      const decision = socialFetchBackfillPageDecision({
        createdAts: page.items.map((item) => item.createdAt),
        rawItemCount: page.rawItemCount,
        cutoffAt: lease.cutoffAt,
        hasMore: page.page.hasMore,
        currentCursor: task.cursor,
        nextCursor: page.page.nextCursor,
        seenCursors: task.seen_cursors,
      });
      try {
        const applied = await applyPageSuccess({
          lease,
          task,
          decision,
          nextCursor: page.page.nextCursor,
          created: persisted.created,
          reportedCredits: page.committedCredits,
        });
        pagesProcessed += 1;
        itemsRecorded += persisted.created;
        if (applied.status === "completed") {
          return { status: "completed", jobId: lease.id, pagesProcessed, itemsRecorded };
        }
        if (applied.status === "paused") {
          return {
            status: "paused",
            jobId: lease.id,
            pagesProcessed,
            itemsRecorded,
            reason: applied.reason ?? "job_credit_cap_reached",
          };
        }
      } catch (error) {
        const message = boundedError(error);
        await markPageFailure(lease, task, message, page.committedCredits);
        pagesProcessed += 1;
        return { status: "paused", jobId: lease.id, pagesProcessed, itemsRecorded, reason: message };
      }
      if (decision.action === "blocked") {
        return { status: "paused", jobId: lease.id, pagesProcessed, itemsRecorded, reason: decision.reason };
      }
    }
    return { status: "processed", jobId: lease.id, pagesProcessed, itemsRecorded };
  } finally {
    await releaseJobLease(lease).catch(() => undefined);
  }
}
