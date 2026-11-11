import { createHash } from "node:crypto";
import { z } from "zod";
import { privateJson, requestHasSameOrigin } from "../rooms/_shared";
import { boundedCreatorJson } from "@/lib/creator-tags/http";
import { query, withTransaction } from "@/lib/db";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { MEMBERS } from "@/lib/members";
import { MULTIVIEW_REMOTE_LEASE_SECONDS, remoteSourceKey, type RemoteCommand, type RemoteDevice, type RemoteSession, type RemoteSource } from "@/lib/watch/multiview-remote";

const Id = z.string().uuid();
const HostSecret = z.string().uuid();
const Member = z.string().refine((value) => MEMBERS.some((member) => member.slug === value));
const Source = z.discriminatedUnion("platform", [
  z.object({ member: Member, platform: z.literal("twitch") }),
  z.object({ member: Member, platform: z.literal("youtube"), videoId: z.string().regex(/^[\w-]{11}$/) }),
]);
const SourceKey = z.string().max(48).refine((value) =>
  MEMBERS.some(({ slug }) => value === `${slug}:twitch` || value === `${slug}:youtube`));
const Input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("heartbeat"), id: Id, secret: HostSecret,
    device: z.enum(["mac", "windows", "computer"]),
    sources: z.array(Source).max(12),
    main: SourceKey.nullable(),
  }),
  z.object({ action: z.literal("select"), id: Id, source: SourceKey }),
  z.object({
    action: z.literal("ack"), id: Id, secret: HostSecret, revision: z.number().int().min(1).max(2_147_483_647),
    status: z.enum(["applied", "unavailable"]),
  }),
  z.object({ action: z.literal("end"), id: Id, secret: HostSecret }),
]);

const LEASE = `now() - interval '${MULTIVIEW_REMOTE_LEASE_SECONDS} seconds'`;
const ACTIVE = `NOT ended AND updated_at > ${LEASE}`;
const COLUMNS = "id, device, sources, main, command_revision, command_source, command_status";
const MAX_SESSIONS = 8;

type SessionRow = {
  id: string;
  device: RemoteDevice;
  sources: RemoteSource[];
  main: string | null;
  command_revision: number;
  command_source: string | null;
  command_status: RemoteCommand["status"];
};

function session(row: SessionRow): RemoteSession {
  return {
    id: row.id, device: row.device, sources: row.sources, main: row.main,
    command: row.command_source ? {
      revision: row.command_revision, source: row.command_source, status: row.command_status,
    } : null,
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
    const { rows } = host
      ? await query<SessionRow>(`SELECT ${COLUMNS} FROM fan_multiview_sessions WHERE user_id = $1 AND id = $2 AND ${ACTIVE}`, [userId, host])
      : await query<SessionRow>(`SELECT ${COLUMNS} FROM fan_multiview_sessions WHERE user_id = $1 AND ${ACTIVE}
          ORDER BY created_at DESC, id LIMIT ${MAX_SESSIONS}`, [userId]);
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
      const main = sources.some((source) => remoteSourceKey(source) === input.main) ? input.main : null;
      const fields = [userId, input.id, input.device, JSON.stringify(sources), main, secretHash];
      const result = await query<SessionRow>(
        `UPDATE fan_multiview_sessions SET device = $3, sources = $4, main = $5, updated_at = now()
          WHERE user_id = $1 AND id = $2 AND host_secret_hash = $6 AND ${ACTIVE} RETURNING ${COLUMNS}`, fields);
      const row = result.rows[0] ?? await withTransaction(async (client) => {
        // Serialize new registrations for this account so parallel tabs cannot exceed the cap.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('multiview-remote'), hashtext($1))", [userId]);
        await client.query(`DELETE FROM fan_multiview_sessions WHERE id IN (
          SELECT id FROM fan_multiview_sessions WHERE updated_at < now() - interval '10 minutes'
          ORDER BY updated_at LIMIT 100 FOR UPDATE SKIP LOCKED)`);
        const inserted = await client.query<SessionRow>(
          `INSERT INTO fan_multiview_sessions AS host (user_id, id, device, sources, main, host_secret_hash)
            SELECT $1, $2, $3, $4, $5, $6 WHERE
              (SELECT count(*) FROM fan_multiview_sessions WHERE user_id = $1 AND id <> $2 AND ${ACTIVE}) < ${MAX_SESSIONS}
            ON CONFLICT (id) DO UPDATE SET
              device = EXCLUDED.device, sources = EXCLUDED.sources, main = EXCLUDED.main, updated_at = now(),
              command_status = CASE WHEN host.updated_at <= ${LEASE} AND host.command_status = 'pending'
                THEN 'unavailable' ELSE host.command_status END
            WHERE host.user_id = $1 AND host.host_secret_hash = $6 AND NOT host.ended
            RETURNING ${COLUMNS}`, fields);
        return inserted.rows[0];
      });
      return row ? privateJson({ session: session(row) }) : failure("Could not open another remote session.", 409);
    }

    if (input.action === "select") {
      const [member, platform] = input.source.split(":");
      const { rows } = await query<SessionRow>(
        `UPDATE fan_multiview_sessions
          SET command_revision = command_revision + 1, command_source = $3, command_status = 'pending'
          WHERE user_id = $1 AND id = $2 AND ${ACTIVE} AND sources @> $4::jsonb
          RETURNING ${COLUMNS}`, [userId, input.id, input.source, JSON.stringify([{ member, platform }])]);
      return rows[0] ? privateJson({ session: session(rows[0]) }) : failure("That source is no longer available on this computer.", 409);
    }

    if (input.action === "ack") {
      const { rows } = await query<SessionRow>(
        `UPDATE fan_multiview_sessions SET command_status = $4,
            main = CASE WHEN $4 = 'applied' THEN command_source ELSE main END
          WHERE user_id = $1 AND id = $2 AND ${ACTIVE} AND command_revision = $3
            AND command_status = 'pending' AND host_secret_hash = $5
          RETURNING ${COLUMNS}`, [userId, input.id, input.revision, input.status, secretHash]);
      return rows[0] ? privateJson({ session: session(rows[0]) }) : failure("The session has changed.", 409);
    }

    await query(`UPDATE fan_multiview_sessions SET ended = true, updated_at = now()
      WHERE user_id = $1 AND id = $2 AND host_secret_hash = $3 AND NOT ended`, [userId, input.id, secretHash]);
    return privateJson({ ok: true });
  } catch {
    return failure("Multiview remote is temporarily unavailable.", 503);
  }
}
