import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { recordContentRemoval } from "@/lib/content-availability";
import { getAppAccessToken } from "@/lib/twitch";

export const TWITCH_AVAILABILITY_BATCH_LIMIT = 50;
export type TwitchAvailabilityTarget = { kind: "videos" | "clips"; id: string; sourceUrl: string };
export type TwitchAvailabilityOutcome = "found" | "not_found" | "unknown";

/** Only explicit archive/clip permalinks qualify; ending a live stream is never deletion evidence. */
export function twitchAvailabilityTarget(input: { sourceUrl?: string; url?: string; href?: string; kind?: string }): TwitchAvailabilityTarget | null {
  if (input.kind === "live") return null;
  for (const raw of [input.sourceUrl, input.url, input.href]) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:") continue;
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (host === "twitch.tv") {
        const video = /^\/videos\/(\d+)\/?$/.exec(url.pathname)?.[1];
        if (video) return { kind: "videos", id: video, sourceUrl: `https://www.twitch.tv/videos/${video}` };
        const clip = /^\/[\w]+\/clip\/([\w-]+)\/?$/.exec(url.pathname)?.[1];
        if (clip) return { kind: "clips", id: clip, sourceUrl: `https://clips.twitch.tv/${clip}` };
      }
      if (host === "clips.twitch.tv") {
        const clip = /^\/([\w-]+)\/?$/.exec(url.pathname)?.[1];
        if (clip && clip !== "embed") return { kind: "clips", id: clip, sourceUrl: `https://clips.twitch.tv/${clip}` };
      }
    } catch { /* Missing/invalid source metadata stays unverified. */ }
  }
  return null;
}

/** Official ID-batch responses omit missing IDs; transport errors and pagination are inconclusive. */
export function twitchAvailabilityOutcomes(requested: readonly string[], response: { status: number; body: unknown }, kind?: TwitchAvailabilityTarget["kind"]): Map<string, TwitchAvailabilityOutcome> {
  const outcomes = new Map(requested.map((id) => [id, "unknown" as TwitchAvailabilityOutcome]));
  // Helix Get Videos documents 404 when every requested ID is absent. This
  // requires our fixed videos ID lookup and Twitch's structured error envelope;
  // generic HTTP/gateway 404s and clips errors remain inconclusive.
  if (kind === "videos" && response.status === 404 && response.body && typeof response.body === "object" && !Array.isArray(response.body)) {
    const error = response.body as { status?: unknown; error?: unknown; message?: unknown };
    if (error.status === 404 && error.error === "Not Found" && typeof error.message === "string"
      && /(?:\b(?:videos?|ids?)\b.{0,80}\b(?:not found|does not exist|do not exist)\b|\bno videos? (?:were )?found\b)/i.test(error.message)) {
      for (const id of requested) outcomes.set(id, "not_found");
      return outcomes;
    }
  }
  if (response.status !== 200 || !response.body || typeof response.body !== "object" || Array.isArray(response.body)) return outcomes;
  const body = response.body as { data?: unknown; error?: unknown; pagination?: { cursor?: unknown } };
  if (!Array.isArray(body.data) || body.error || body.pagination?.cursor) return outcomes;
  const found = new Set<string>();
  for (const item of body.data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return outcomes;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== "string" || !outcomes.has(id) || found.has(id)) return outcomes;
    found.add(id);
  }
  for (const id of requested) outcomes.set(id, found.has(id) ? "found" : "not_found");
  return outcomes;
}

type TwitchReconciliationDependencies = {
  configured(): boolean;
  claim(): Promise<string | null>;
  ownsLease(token: string): Promise<boolean>;
  seed(): Promise<void>;
  due(limit: number): Promise<TwitchAvailabilityTarget[]>;
  lookup(kind: TwitchAvailabilityTarget["kind"], ids: string[]): Promise<{ status: number; body: unknown }>;
  remove(target: TwitchAvailabilityTarget): Promise<unknown>;
  checked(target: TwitchAvailabilityTarget, outcome: TwitchAvailabilityOutcome): Promise<void>;
  release(token: string): Promise<void>;
};

/** Shared scheduler only: at most fifty objects and two ID-batch requests per two-hour lane. */
export function createTwitchAvailabilityReconciler(deps: TwitchReconciliationDependencies) {
  return async function reconcile() {
    const result = { status: "not_due" as "not_due" | "unconfigured" | "checked" | "lease_lost", checked: 0, removed: 0, unknown: 0, requests: 0 };
    if (!deps.configured()) return { ...result, status: "unconfigured" as const };
    const token = await deps.claim();
    if (!token) return result;
    try {
      await deps.seed();
      const due = await deps.due(TWITCH_AVAILABILITY_BATCH_LIMIT);
      const unique = [...new Map(due.flatMap((candidate) => {
        const valid = twitchAvailabilityTarget(candidate);
        return valid && valid.id === candidate.id && valid.kind === candidate.kind ? [[`${valid.kind}:${valid.id}`, valid] as const] : [];
      })).values()].slice(0, TWITCH_AVAILABILITY_BATCH_LIMIT);
      for (const kind of ["videos", "clips"] as const) {
        const batch = unique.filter((candidate) => candidate.kind === kind);
        if (!batch.length) continue;
        if (!await deps.ownsLease(token)) return { ...result, status: "lease_lost" as const };
        let outcomes: Map<string, TwitchAvailabilityOutcome>;
        result.requests += 1;
        try { outcomes = twitchAvailabilityOutcomes(batch.map((candidate) => candidate.id), await deps.lookup(kind, batch.map((candidate) => candidate.id)), kind); }
        catch { outcomes = new Map(batch.map((candidate) => [candidate.id, "unknown"])); }
        for (const candidate of batch) {
          let outcome = outcomes.get(candidate.id) ?? "unknown";
          if (outcome === "not_found") {
            try { await deps.remove(candidate); result.removed += 1; }
            catch { outcome = "unknown"; }
          }
          await deps.checked(candidate, outcome);
          result.checked += 1;
          if (outcome === "unknown") result.unknown += 1;
        }
      }
      return { ...result, status: "checked" as const };
    } finally { await deps.release(token); }
  };
}

/** Authenticated cron entry; no visitor or per-user path invokes this. */
export const reconcileTwitchContentAvailability = createTwitchAvailabilityReconciler({
  configured: () => Boolean(process.env.TWITCH_CLIENT_ID?.trim() && process.env.TWITCH_CLIENT_SECRET?.trim()),
  async claim() {
    const token = randomUUID();
    const claim = await query(
      `UPDATE twitch_content_verification_schedule SET lease_token=$1::uuid,lease_until=now()+interval '5 minutes',
         next_run_at=now()+interval '2 hours',last_started_at=now()
       WHERE lane='twitch_objects' AND next_run_at<=now() AND (lease_until IS NULL OR lease_until<=now()) RETURNING lane`, [token]);
    return claim.rowCount ? token : null;
  },
  async seed() {
    const [{ getWatchCatalog }, { mediaIntelligenceQuery }] = await Promise.all([
      import("@/lib/watch/catalog"), import("@/lib/media-intelligence/schema"),
    ]);
    const [catalog, archived] = await Promise.all([
      getWatchCatalog().then((value) => value.all.filter((item) => item.platform === "twitch")).catch(() => []),
      mediaIntelligenceQuery<{ external_id: string; source_url: string | null }>(
        "SELECT external_id,source_url FROM media_intelligence_assets WHERE platform='twitch' AND active=true",
      ).then((value) => value.rows.map((row) => ({ id: row.external_id, sourceUrl: row.source_url ?? undefined }))).catch(() => []),
    ]);
    const targets = [...new Map([...catalog, ...archived].flatMap((item) => {
      const target = twitchAvailabilityTarget(item);
      return target ? [[`${target.kind}:${target.id}`, target] as const] : [];
    })).values()];
    if (!targets.length) return;
    await query(`INSERT INTO twitch_content_verification_checks(kind,provider_id,source_url)
      SELECT kind,id,source_url FROM jsonb_to_recordset($1::jsonb) AS target(kind text,id text,source_url text)
      ON CONFLICT(kind,provider_id) DO NOTHING`, [JSON.stringify(targets.map(({ kind, id, sourceUrl }) => ({ kind, id, source_url: sourceUrl })))]);
  },
  async ownsLease(token) {
    const result = await query("SELECT lane FROM twitch_content_verification_schedule WHERE lane='twitch_objects' AND lease_token=$1::uuid AND lease_until>now()", [token]);
    return Boolean(result.rowCount);
  },
  async due(limit) {
    const due = await query<{ kind: TwitchAvailabilityTarget["kind"]; provider_id: string; source_url: string }>(
      `SELECT kind,provider_id,source_url FROM twitch_content_verification_checks
       WHERE next_check_at<=now() AND last_outcome<>'not_found'
       ORDER BY next_check_at,first_seen_at,kind,provider_id LIMIT $1`, [limit]);
    return due.rows.map((row) => ({ kind: row.kind, id: row.provider_id, sourceUrl: row.source_url }));
  },
  async lookup(kind, ids) {
    const token = await getAppAccessToken();
    const url = new URL(`https://api.twitch.tv/helix/${kind}`);
    ids.forEach((id) => url.searchParams.append("id", id));
    url.searchParams.set("first", "100");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "Client-Id": process.env.TWITCH_CLIENT_ID! }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return { status: response.status, body: response.status === 200 || response.status === 404 ? await response.json().catch(() => null) : null };
  },
  remove: (target) => recordContentRemoval({ provider: "twitch", providerId: target.kind === "videos" ? `video:${target.id}` : `clip:${target.id}`,
    sourceUrl: target.sourceUrl, reason: "not_found", evidence: "provider_lookup" }),
  async checked(target, outcome) {
    const hours = outcome === "found" ? 24 : outcome === "unknown" ? 6 : 24 * 365;
    await query(`UPDATE twitch_content_verification_checks SET last_checked_at=now(),last_outcome=$3,next_check_at=now()+($4::integer*interval '1 hour')
      WHERE kind=$1 AND provider_id=$2`, [target.kind, target.id, outcome, hours]);
  },
  async release(token) {
    await query("UPDATE twitch_content_verification_schedule SET lease_token=NULL,lease_until=NULL,last_completed_at=now() WHERE lane='twitch_objects' AND lease_token=$1::uuid", [token]);
  },
});
