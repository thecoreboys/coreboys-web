import "server-only";
import { availableMediaAnalyzers, prepareWatchItem } from "./analyzer";
import {
  cancelClaimedAnalysisJob,
  claimNextAnalysisJob,
  completeAnalysisJob,
  dispatchMediaOutbox,
  failAnalysisJob,
  loadMediaJobItem,
  renewAnalysisJobLease,
} from "./jobs";
import { getMediaIntelligenceStore } from "./postgres-store";
import type { MediaIntelligenceJob } from "./types";

export type MediaWorkerSummary = {
  claimed: number;
  analyzed: number;
  unchanged: number;
  failed: number;
  outboxPublished: number;
};

function boundedLeaseSeconds(value: number | undefined): number {
  const configured = Number(process.env.MEDIA_INTELLIGENCE_JOB_LEASE_SECONDS);
  const candidate = value ?? (Number.isFinite(configured) ? configured : 300);
  return Math.max(30, Math.min(3_600, Math.trunc(candidate)));
}

function startLeaseHeartbeat(job: MediaIntelligenceJob, workerId: string, leaseSeconds: number) {
  let stopped = false;
  let lost = false;
  let pending: Promise<boolean> | null = null;
  const renew = async (): Promise<boolean> => {
    if (stopped || lost) return false;
    if (!pending) {
      pending = renewAnalysisJobLease(job.id, workerId, leaseSeconds)
        .catch(() => false)
        .finally(() => { pending = null; });
    }
    const renewed = await pending;
    if (!renewed) lost = true;
    return renewed;
  };
  const intervalMs = Math.max(10_000, Math.min(60_000, Math.floor(leaseSeconds * 1_000 / 3)));
  const timer = setInterval(() => { void renew(); }, intervalMs);
  timer.unref?.();
  return {
    renew,
    get lost() { return lost; },
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (pending) await pending;
    },
  };
}

export async function runMediaWorkerBatch(options: {
  workerId?: string;
  maxJobs?: number;
  leaseSeconds?: number;
} = {}): Promise<MediaWorkerSummary> {
  const analyzers = availableMediaAnalyzers();
  const store = getMediaIntelligenceStore();
  const maxJobs = Math.max(0, Math.min(500, Math.trunc(options.maxJobs ?? 50)));
  const leaseSeconds = boundedLeaseSeconds(options.leaseSeconds);
  const workerId = options.workerId?.trim() || `local-metadata:${process.pid}`;
  const summary: MediaWorkerSummary = { claimed: 0, analyzed: 0, unchanged: 0, failed: 0, outboxPublished: 0 };
  for (let index = 0; index < maxJobs; index += 1) {
    const job = await claimNextAnalysisJob(
      workerId,
      analyzers.map((analyzer) => analyzer.stage),
      leaseSeconds,
    );
    if (!job) break;
    summary.claimed += 1;
    let claimedRun: ReturnType<typeof prepareWatchItem>["claim"] | null = null;
    const heartbeat = startLeaseHeartbeat(job, workerId, leaseSeconds);
    try {
      if (!await heartbeat.renew()) throw new Error("analysis_job_policy_or_lease_invalid");
      const item = await loadMediaJobItem(job);
      if (!item) throw new Error("media_job_asset_missing");
      const analyzer = analyzers.find((candidate) => (
        candidate.stage === job.stage
        && candidate.name === job.analyzer
        && candidate.version === job.analyzerVersion
      ));
      if (!analyzer) throw new Error("media_job_analyzer_unavailable");
      const prepared = prepareWatchItem(item, analyzer);
      if (prepared.revision.id !== job.revisionId || prepared.claim.idempotencyKey !== job.idempotencyKey) {
        throw new Error("media_job_revision_mismatch");
      }
      const claim = await store.claimAnalysis(prepared.claim);
      if (claim === "complete") {
        summary.unchanged += 1;
      } else if (claim === "busy") {
        throw new Error("analysis_claim_busy");
      } else {
        claimedRun = prepared.claim;
        const completed = await analyzer.analyze(item, prepared.asset, prepared.revision, prepared.claim);
        if (!await heartbeat.renew()) throw new Error("analysis_job_policy_or_lease_invalid");
        await store.completeAnalysis(completed);
        claimedRun = null;
        summary.analyzed += 1;
      }
      await heartbeat.stop();
      if (heartbeat.lost) {
        throw new Error("analysis_job_policy_or_lease_invalid");
      }
      if (!await completeAnalysisJob(job, workerId)) {
        await cancelClaimedAnalysisJob(job, workerId, "analysis_job_policy_or_lease_invalid").catch(() => false);
        throw new Error("analysis_job_policy_or_lease_invalid");
      }
    } catch (error) {
      await heartbeat.stop();
      if (claimedRun) await store.failAnalysis(claimedRun, error).catch(() => {});
      if (heartbeat.lost) {
        await cancelClaimedAnalysisJob(job, workerId, "analysis_job_policy_or_lease_invalid").catch(() => false);
      } else {
        await failAnalysisJob(job, workerId, error);
      }
      summary.failed += 1;
    }
  }
  const outbox = await dispatchMediaOutbox(50);
  summary.outboxPublished = outbox.published;
  return summary;
}
