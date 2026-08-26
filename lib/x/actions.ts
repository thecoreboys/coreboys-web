import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db";
import { providerHasScope } from "@/lib/oauth/providers";
import { accessTokenFor } from "@/lib/oauth/refresh";
import { X_ACTION_RATE_LIMIT, X_ACTION_SCOPE, xActionRequestIsValid, xActionTarget } from "./action-policy";
import { ensureXIntegrationSchema } from "./schema";
import type { XActionKind } from "./types";
import { reserveXSpend, xApiPricing } from "./usage";

const OVERALL_PER_MINUTE = 14;

export type XNativeActionInput = {
  action: XActionKind;
  postId?: string | null;
  targetUserId?: string | null;
  text?: string | null;
};

export type XNativeActionResult = {
  ok: boolean;
  action: XActionKind;
  status: "succeeded" | "rejected" | "failed" | "pending";
  replayed?: boolean;
  responseRef?: string | null;
  error?: string;
  needsReconnect?: boolean;
  retryAfterSeconds?: number;
};

type AuditRow = {
  id: string;
  action: XActionKind;
  request_hash: string;
  status: "pending" | "succeeded" | "rejected" | "failed";
  provider_response_ref: string | null;
  error_code: string | null;
};

class XActionPolicyError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "XActionPolicyError";
  }
}

function requestHash(input: XNativeActionInput): string {
  return createHash("sha256").update(JSON.stringify({
    action: input.action,
    postId: input.postId ?? null,
    targetUserId: input.targetUserId ?? null,
    text: input.text?.trim() ?? null,
  })).digest("hex");
}

function publicError(code: string): string {
  if (code === "disabled") return "One-tap X actions are not enabled. Use the official X button instead.";
  if (code === "credentials_missing") return "The X application is not configured.";
  if (code === "credit_gate_missing" || code === "price_missing") return "One-tap X actions are waiting for an operator credit limit.";
  if (code === "monthly_ceiling_reached") return "The monthly X API safety ceiling has been reached.";
  if (code === "rate_limited") return "Too many X actions. Wait a moment and try again.";
  if (code === "idempotency_conflict") return "That action key was already used for a different request.";
  return "X could not confirm that action. Check the post on X before trying again.";
}

async function consumeRateLimit(
  client: PoolClient,
  userId: string,
  action: XActionKind,
): Promise<void> {
  const checks: Array<[string, number]> = [["all", OVERALL_PER_MINUTE], [action, X_ACTION_RATE_LIMIT[action]]];
  for (const [bucketAction, maximum] of checks) {
    const { rows } = await client.query<{ hits: number }>(`
      INSERT INTO x_rate_limits(subject_key,action,bucket_started_at,hits)
      VALUES($1,$2,date_trunc('minute',now()),1)
      ON CONFLICT(subject_key,action,bucket_started_at)
      DO UPDATE SET hits=x_rate_limits.hits+1
      RETURNING hits
    `, [`fan:${userId}`, bucketAction]);
    if ((rows[0]?.hits ?? 0) > maximum) throw new XActionPolicyError("rate_limited", 429, 60);
  }
}

async function reserveAction(
  userId: string,
  input: XNativeActionInput,
  idempotencyKey: string,
): Promise<{ row: AuditRow; replayed: boolean }> {
  await ensureXIntegrationSchema();
  const hash = requestHash(input);
  const target = xActionTarget(input)!;
  const estimatedCost = xApiPricing().writeActionMicrousd;
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`x-action:${userId}:${idempotencyKey}`]);
    const existing = await client.query<AuditRow>(
      `SELECT id::text,action,request_hash,status,provider_response_ref,error_code
         FROM x_action_audit WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE`,
      [userId, idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== hash) {
        throw new XActionPolicyError("idempotency_conflict", 409);
      }
      return { row: existing.rows[0], replayed: true };
    }
    await consumeRateLimit(client, userId, input.action);
    const spend = await reserveXSpend(client, estimatedCost);
    if (!spend.ok) throw new XActionPolicyError(spend.reason, 503);
    const inserted = await client.query<AuditRow>(`
      INSERT INTO x_action_audit
        (user_id,action,target_ref,idempotency_key,request_hash,status,estimated_cost_microusd)
      VALUES($1,$2,$3,$4,$5,'pending',$6)
      RETURNING id::text,action,request_hash,status,provider_response_ref,error_code
    `, [userId, input.action, target, idempotencyKey, hash, estimatedCost]);
    return { row: inserted.rows[0]!, replayed: false };
  });
}

function replayResult(row: AuditRow): XNativeActionResult {
  return {
    ok: row.status === "succeeded",
    action: row.action,
    status: row.status,
    replayed: true,
    responseRef: row.provider_response_ref,
    error: row.status === "succeeded" ? undefined : publicError(row.error_code ?? "provider_rejected"),
  };
}

function requestForAction(input: XNativeActionInput, userProviderId: string): {
  url: string;
  init: RequestInit;
} {
  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (input.action === "like") return {
    url: `https://api.x.com/2/users/${userProviderId}/likes`,
    init: json({ tweet_id: input.postId }),
  };
  if (input.action === "unlike") return {
    url: `https://api.x.com/2/users/${userProviderId}/likes/${input.postId}`,
    init: { method: "DELETE" },
  };
  if (input.action === "repost") return {
    url: `https://api.x.com/2/users/${userProviderId}/retweets`,
    init: json({ tweet_id: input.postId }),
  };
  if (input.action === "unrepost") return {
    url: `https://api.x.com/2/users/${userProviderId}/retweets/${input.postId}`,
    init: { method: "DELETE" },
  };
  if (input.action === "reply") return {
    url: "https://api.x.com/2/tweets",
    init: json({ text: input.text?.trim(), reply: { in_reply_to_tweet_id: input.postId } }),
  };
  if (input.action === "follow") return {
    url: `https://api.x.com/2/users/${userProviderId}/following`,
    init: json({ target_user_id: input.targetUserId }),
  };
  return {
    url: `https://api.x.com/2/users/${userProviderId}/following/${input.targetUserId}`,
    init: { method: "DELETE" },
  };
}

async function finishAction(input: {
  auditId: string;
  userId: string;
  idempotencyKey: string;
  action: XActionKind;
  ok: boolean;
  statusCode: number | null;
  responseRef: string | null;
  errorCode: string | null;
  billable?: boolean;
}): Promise<void> {
  const cost = xApiPricing().writeActionMicrousd;
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE x_action_audit SET status=$2,provider_status=$3,provider_response_ref=$4,error_code=$5,
        estimated_cost_microusd=CASE WHEN $6::boolean THEN estimated_cost_microusd ELSE 0 END,updated_at=now()
        WHERE id=$1 AND status='pending'`,
      [input.auditId, input.ok ? "succeeded" : input.statusCode === null ? "failed" : "rejected", input.statusCode, input.responseRef, input.errorCode, input.billable !== false],
    );
    if (input.billable !== false) {
      await client.query(
        `INSERT INTO x_api_usage
          (category,endpoint,operation,resource_count,estimated_cost_microusd,cache_hit,success,user_id,idempotency_key)
         VALUES('write','native-action',$1,1,$2,false,$3,$4,$5)`,
        [input.action, cost, input.ok, input.userId, input.idempotencyKey],
      );
    }
  });
}

export async function performXNativeAction(
  userId: string,
  input: XNativeActionInput,
  idempotencyKey: string,
): Promise<{ result: XNativeActionResult; httpStatus: number }> {
  if (!xActionRequestIsValid(input)) {
    return { result: { ok: false, action: input.action, status: "rejected", error: "Invalid X action." }, httpStatus: 400 };
  }
  let reservation: Awaited<ReturnType<typeof reserveAction>>;
  try {
    reservation = await reserveAction(userId, input, idempotencyKey);
  } catch (error) {
    if (error instanceof XActionPolicyError) {
      return {
        result: {
          ok: false,
          action: input.action,
          status: "rejected",
          error: publicError(error.code),
          retryAfterSeconds: error.retryAfterSeconds,
        },
        httpStatus: error.statusCode,
      };
    }
    throw error;
  }
  if (reservation.replayed) {
    const status = reservation.row.status === "pending" ? 409 : 200;
    return { result: replayResult(reservation.row), httpStatus: status };
  }

  const pair = await accessTokenFor(userId, "x");
  const requiredScope = X_ACTION_SCOPE[input.action];
  if (!pair || !pair.row.provider_user_id || !providerHasScope(pair.row.scopes, requiredScope)) {
    await finishAction({
      auditId: reservation.row.id,
      userId,
      idempotencyKey,
      action: input.action,
      ok: false,
      statusCode: 403,
      responseRef: null,
      errorCode: "reconnect",
      billable: false,
    });
    return {
      result: { ok: false, action: input.action, status: "rejected", error: "Reconnect X to approve this action.", needsReconnect: true },
      httpStatus: 403,
    };
  }

  const outbound = requestForAction(input, pair.row.provider_user_id);
  try {
    const response = await fetch(outbound.url, {
      ...outbound.init,
      headers: { ...outbound.init.headers, Authorization: `Bearer ${pair.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    let responseRef: string | null = null;
    if (response.ok) {
      try {
        const body = (await response.json()) as { data?: { id?: string } };
        responseRef = body.data?.id ?? null;
      } catch { /* successful DELETE responses can be empty */ }
    }
    const errorCode = response.ok
      ? null
      : response.status === 401 || response.status === 403
        ? "provider_permission"
        : response.status === 429
          ? "provider_rate_limit"
          : "provider_rejected";
    await finishAction({
      auditId: reservation.row.id,
      userId,
      idempotencyKey,
      action: input.action,
      ok: response.ok,
      statusCode: response.status,
      responseRef,
      errorCode,
    });
    return {
      result: response.ok
        ? { ok: true, action: input.action, status: "succeeded", responseRef }
        : { ok: false, action: input.action, status: "rejected", error: publicError(errorCode ?? "provider_rejected"), needsReconnect: response.status === 401 || response.status === 403 },
      httpStatus: response.ok ? 200 : response.status === 429 ? 429 : 400,
    };
  } catch {
    await finishAction({
      auditId: reservation.row.id,
      userId,
      idempotencyKey,
      action: input.action,
      ok: false,
      statusCode: null,
      responseRef: null,
      errorCode: "provider_outcome_unknown",
    });
    return {
      result: { ok: false, action: input.action, status: "failed", error: publicError("provider_outcome_unknown") },
      httpStatus: 503,
    };
  }
}
