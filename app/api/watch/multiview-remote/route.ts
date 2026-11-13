import { createHash } from "node:crypto";
import { z } from "zod";
import { privateJson, requestHasSameOrigin } from "../rooms/_shared";
import { boundedCreatorJson } from "@/lib/creator-tags/http";
import { query, withTransaction } from "@/lib/db";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { MEMBERS } from "@/lib/members";
import {
  MULTIVIEW_REMOTE_LEASE_SECONDS, REMOTE_CONTROL_PREFIX, REMOTE_CONTROLS, REMOTE_LAYOUTS, remoteControlFromCommand, remoteSourceKey,
  type RemoteCommand, type RemoteDevice, type RemoteHostState, type RemoteSession, type RemoteSource,
} from "@/lib/watch/multiview-remote";

const Id = z.string().uuid();
const HostSecret = z.string().uuid();
const Member = z.string().refine((value) => MEMBERS.some((member) => member.slug === value));
const Source = z.discriminatedUnion("platform", [
  z.object({ member: Member, platform: z.literal("twitch") }),
  z.object({ member: Member, platform: z.literal("youtube"), videoId: z.string().regex(/^[\w-]{11}$/) }),
]);
const SourceKey = z.string().max(48).refine((value) =>
  MEMBERS.some(({ slug }) => value === `${slug}:twitch` || value === `${slug}:youtube`));
const HostState = z.object({
  mainAudible: z.boolean(),
  audibleCount: z.number().int().min(0).max(64),
  audible: z.array(SourceKey).max(12),
  maximized: z.boolean(),
  layout: z.enum(REMOTE_LAYOUTS),
});
const Input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("heartbeat"), id: Id, secret: HostSecret,
    device: z.enum(["mac", "windows", "computer"]),
    sources: z.array(Source).max(12),
    main: SourceKey.nullable(),
    // Older host tabs do not report state; the phone then hides playback controls.
    state: HostState.optional(),
  }),
  z.object({ action: z.literal("select"), id: Id, source: SourceKey }),
  z.object({ action: z.literal("control"), id: Id, control: z.enum(REMOTE_CONTROLS) }),
  z.object({
    action: z.literal("ack"), id: Id, secret: HostSecret, revision: z.number().int().min(1).max(2_147_483_647),
    status: z.enum(["applied", "unavailable"]),
  }),
  z.object({ action: z.literal("end"), id: Id, secret: HostSecret }),
]);

const LEASE = `now() - interval '${MULTIVIEW_REMOTE_LEASE_SECONDS} seconds'`;
const ACTIVE = `NOT ended AND updated_at > ${LEASE}`;
const BASE_COLUMNS = "id, device, sources, main, command_revision, command_source, command_status";
const MAX_SESSIONS = 8;

// `state` arrives with migration 074. Until it is applied, keep the remote
// working without host state (and without playback controls), re-checking
// periodically so the feature lights up once the column exists.
const STATE_RECHECK_MS = 5 * 60_000;
let stateColumnMissingAt: number | null = null;

function isUndefinedColumn(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42703";
}

async function withStateColumn<T>(run: (hasState: boolean, columns: string) => Promise<T>): Promise<T> {
  if (stateColumnMissingAt !== null && Date.now() - stateColumnMissingAt >= STATE_RECHECK_MS) stateColumnMissingAt = null;
  if (stateColumnMissingAt !== null) return run(false, BASE_COLUMNS);
  try {
    return await run(true, `${BASE_COLUMNS}, state`);
  } catch (error) {
    if (!isUndefinedColumn(error)) throw error;
    stateColumnMissingAt = Date.now();
    return run(false, BASE_COLUMNS);
  }
}

type SessionRow = {
  id: string;
  device: RemoteDevice;
  sources: RemoteSource[];
  main: string | null;
  command_revision: number;
  command_source: string | null;
  command_status: RemoteCommand["status"];
  state?: RemoteHostState | null;
};

function session(row: SessionRow): RemoteSession {
  const control = remoteControlFromCommand(row.command_source);
  return {
    id: row.id, device: row.device, sources: row.sources, main: row.main,
    command: row.command_source ? {
      revision: row.command_revision,
      source: control ? null : row.command_source,
      control,
      status: row.command_status,
    } : null,
    state: row.state ?? null,
  };
}

function failure(error: string, status: number) {
  return privateJson({ error }, { status });
}

export async function GET(request: Request) {
  const userId = await getCurrentFanUserId();
  if (!userId) return failure("Sign in to use Multiview remote.", 401);
  const host = new URL(request.url).searchParams.get("host");
  if (host && !Id.safeParse(host).success) return failure("Invalid session.", 400);
  try {
    const { rows } = await withStateColumn((_, columns) => host
      ? query<SessionRow>(`SELECT ${columns} FROM fan_multiview_sessions WHERE user_id = $1 AND id = $2 AND ${ACTIVE}`, [userId, host])
      : query<SessionRow>(`SELECT ${columns} FROM fan_multiview_sessions WHERE user_id = $1 AND ${ACTIVE}
          ORDER BY created_at DESC, id LIMIT ${MAX_SESSIONS}`, [userId]));
    return privateJson({ sessions: rows.map(session) });
  } catch {
    return failure("Multiview remote is temporarily unavailable.", 503);
  }
}

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return failure("Invalid request origin.", 403);
  const userId = await getCurrentFanUserId();
  if (!userId) return failure("Sign in to use Multiview remote.", 401);
  const parsed = Input.safeParse(await boundedCreatorJson(request, 4096).catch(() => null));
  if (!parsed.success) return failure("Invalid remote request.", 400);
  const input = parsed.data;
  const secretHash = "secret" in input ? createHash("sha256").update(input.secret).digest("hex") : null;

  try {
    if (input.action === "heartbeat") {
      const sources = [...new Map(input.sources.map((source) => [remoteSourceKey(source), source])).values()];
      const keys = new Set(sources.map(remoteSourceKey));
      const main = input.main && keys.has(input.main) ? input.main : null;
      const state = input.state
        ? JSON.stringify({ ...input.state, audible: [...new Set(input.state.audible)].filter((key) => keys.has(key)) })
        : null;
      const row = await withStateColumn(async (hasState, columns) => {
        const fields = [userId, input.id, input.device, JSON.stringify(sources), main, secretHash, ...(hasState ? [state] : [])];
        const result = await query<SessionRow>(
          `UPDATE fan_multiview_sessions SET device = $3, sources = $4, main = $5${hasState ? ", state = $7::jsonb" : ""}, updated_at = now()
            WHERE user_id = $1 AND id = $2 AND host_secret_hash = $6 AND ${ACTIVE} RETURNING ${columns}`, fields);
        return result.rows[0] ?? await withTransaction(async (client) => {
          // Serialize new registrations for this account so parallel tabs cannot exceed the cap.
          await client.query("SELECT pg_advisory_xact_lock(hashtext('multiview-remote'), hashtext($1))", [userId]);
          await client.query(`DELETE FROM fan_multiview_sessions WHERE id IN (
            SELECT id FROM fan_multiview_sessions WHERE updated_at < now() - interval '10 minutes'
            ORDER BY updated_at LIMIT 100 FOR UPDATE SKIP LOCKED)`);
          const inserted = await client.query<SessionRow>(
            `INSERT INTO fan_multiview_sessions AS host (user_id, id, device, sources, main, host_secret_hash${hasState ? ", state" : ""})
              SELECT $1, $2, $3, $4, $5, $6${hasState ? ", $7::jsonb" : ""} WHERE
                (SELECT count(*) FROM fan_multiview_sessions WHERE user_id = $1 AND id <> $2 AND ${ACTIVE}) < ${MAX_SESSIONS}
              ON CONFLICT (id) DO UPDATE SET
                device = EXCLUDED.device, sources = EXCLUDED.sources, main = EXCLUDED.main,${hasState ? " state = EXCLUDED.state," : ""} updated_at = now(),
                command_status = CASE WHEN host.updated_at <= ${LEASE} AND host.command_status = 'pending'
                  THEN 'unavailable' ELSE host.command_status END
              WHERE host.user_id = $1 AND host.host_secret_hash = $6 AND NOT host.ended
              RETURNING ${columns}`, fields);
          return inserted.rows[0];
        });
      });
      return row ? privateJson({ session: session(row) }) : failure("Could not open another remote session.", 409);
    }

    if (input.action === "select") {
      const [member, platform] = input.source.split(":");
      const { rows } = await withStateColumn((_, columns) => query<SessionRow>(
        `UPDATE fan_multiview_sessions
          SET command_revision = command_revision + 1, command_source = $3, command_status = 'pending'
          WHERE user_id = $1 AND id = $2 AND ${ACTIVE} AND sources @> $4::jsonb
          RETURNING ${columns}`, [userId, input.id, input.source, JSON.stringify([{ member, platform }])]));
      return rows[0] ? privateJson({ session: session(rows[0]) }) : failure("That source is no longer available on this computer.", 409);
    }

    if (input.action === "control") {
      // Only hosts that report state understand playback controls, so a
      // missing column or an older host tab rejects the command up front.
      const { rows } = await withStateColumn((hasState, columns) => hasState ? query<SessionRow>(
        `UPDATE fan_multiview_sessions
          SET command_revision = command_revision + 1, command_source = $3, command_status = 'pending'
          WHERE user_id = $1 AND id = $2 AND ${ACTIVE} AND state IS NOT NULL
          RETURNING ${columns}`, [userId, input.id, REMOTE_CONTROL_PREFIX + input.control]) : Promise.resolve({ rows: [] as SessionRow[] }));
      return rows[0] ? privateJson({ session: session(rows[0]) }) : failure("This computer can\u2019t take playback controls yet.", 409);
    }

    if (input.action === "ack") {
      // Playback controls are acknowledged like source switches but never change `main`.
      const { rows } = await withStateColumn((_, columns) => query<SessionRow>(
        `UPDATE fan_multiview_sessions SET command_status = $4,
            main = CASE WHEN $4 = 'applied' AND NOT starts_with(command_source, $6) THEN command_source ELSE main END
          WHERE user_id = $1 AND id = $2 AND ${ACTIVE} AND command_revision = $3
            AND command_status = 'pending' AND host_secret_hash = $5
          RETURNING ${columns}`, [userId, input.id, input.revision, input.status, secretHash, REMOTE_CONTROL_PREFIX]));
      return rows[0] ? privateJson({ session: session(rows[0]) }) : failure("The session has changed.", 409);
    }

    await query(`UPDATE fan_multiview_sessions SET ended = true, updated_at = now()
      WHERE user_id = $1 AND id = $2 AND host_secret_hash = $3 AND NOT ended`, [userId, input.id, secretHash]);
    return privateJson({ ok: true });
  } catch {
    return failure("Multiview remote is temporarily unavailable.", 503);
  }
}
