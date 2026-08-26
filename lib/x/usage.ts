import "server-only";

import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import { xNativeActionsEnvironment } from "./config";
import { ensureXIntegrationSchema } from "./schema";

const MICRO_USD = 1_000_000;
const RESERVATION_MINUTES = 15;

export type XBudgetGateReason =
  | "disabled"
  | "credentials_missing"
  | "credit_gate_missing"
  | "price_missing"
  | "monthly_ceiling_reached";

export type XApiBudgetReservation = {
  id: string;
  reservedMicrousd: number;
};

type XApiReservationRow = {
  id: string;
  category: "read" | "write";
  operation: string;
  reserved_microusd: string;
  status: "pending" | "reconciled" | "released" | "expired";
};

function positiveUsd(name: string): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function xApiPricing() {
  return {
    readPostMicrousd: Math.round(positiveUsd("X_API_READ_POST_UNIT_USD") * MICRO_USD),
    readUserMicrousd: Math.round(positiveUsd("X_API_READ_USER_UNIT_USD") * MICRO_USD),
    writeActionMicrousd: Math.round(positiveUsd("X_API_WRITE_ACTION_UNIT_USD") * MICRO_USD),
  };
}

export type XUsageSummary = {
  month: string;
  requestCount: number;
  resources: number;
  cacheHits: number;
  estimatedSpendUsd: number;
  pendingReservedUsd: number;
  monthlyCeilingUsd: number;
  declaredCreditBalanceUsd: number;
  remainingGateUsd: number;
  nativeActionsEnabled: boolean;
};

export async function getXUsageSummary(): Promise<XUsageSummary> {
  await ensureXIntegrationSchema();
  const env = xNativeActionsEnvironment();
  const { rows } = await query<{
    requests: string;
    resources: string;
    hits: string;
    spend: string;
    pending: string;
  }>(`
    SELECT COUNT(*)::text AS requests,
           COALESCE(SUM(resource_count),0)::text AS resources,
           COALESCE(SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END),0)::text AS hits,
           COALESCE(SUM(estimated_cost_microusd),0)::text AS spend,
           (
             (SELECT COALESCE(SUM(estimated_cost_microusd),0) FROM x_action_audit
               WHERE status='pending' AND created_at >= date_trunc('month',now())) +
             (SELECT COALESCE(SUM(reserved_microusd),0) FROM x_api_reservations
               WHERE status='pending' AND expires_at>now()
                 AND created_at >= date_trunc('month',now()))
           )::text AS pending
      FROM x_api_usage
     WHERE created_at >= date_trunc('month',now())
  `);
  const row = rows[0];
  const spend = Number(row?.spend ?? 0) / MICRO_USD;
  const pending = Number(row?.pending ?? 0) / MICRO_USD;
  const cap = Math.min(env.monthlyCeilingUsd, env.declaredCreditBalanceUsd);
  return {
    month: new Date().toISOString().slice(0, 7),
    requestCount: Number(row?.requests ?? 0),
    resources: Number(row?.resources ?? 0),
    cacheHits: Number(row?.hits ?? 0),
    estimatedSpendUsd: spend,
    pendingReservedUsd: pending,
    monthlyCeilingUsd: env.monthlyCeilingUsd,
    declaredCreditBalanceUsd: env.declaredCreditBalanceUsd,
    remainingGateUsd: Math.max(0, cap - spend - pending),
    nativeActionsEnabled: env.enabled,
  };
}

export async function recordXUsage(input: {
  category: "read" | "write";
  endpoint: string;
  operation: string;
  resourceCount?: number;
  estimatedCostMicrousd?: number;
  cacheHit?: boolean;
  success?: boolean;
  userId?: string | null;
  idempotencyKey?: string | null;
}): Promise<void> {
  await ensureXIntegrationSchema();
  await query(
    `INSERT INTO x_api_usage
       (category,endpoint,operation,resource_count,estimated_cost_microusd,cache_hit,success,user_id,idempotency_key)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.category,
      input.endpoint.slice(0, 160),
      input.operation.slice(0, 80),
      Math.max(0, Math.trunc(input.resourceCount ?? 1)),
      Math.max(0, Math.trunc(input.estimatedCostMicrousd ?? 0)),
      Boolean(input.cacheHit),
      input.success !== false,
      input.userId ?? null,
      input.idempotencyKey?.slice(0, 120) ?? null,
    ],
  );
}

/** Usage telemetry must never break a public feed if the database is offline. */
export async function recordXUsageSafely(input: Parameters<typeof recordXUsage>[0]): Promise<void> {
  try {
    await recordXUsage(input);
  } catch {
    // Monitoring is best effort; action reservations use strict transactions.
  }
}

export async function reserveXSpend(
  client: PoolClient,
  estimatedCostMicrousd: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const env = xNativeActionsEnvironment();
  if (!env.explicitEnable) return { ok: false, reason: "disabled" };
  if (!env.credentials) return { ok: false, reason: "credentials_missing" };
  if (!env.creditGate) return { ok: false, reason: "credit_gate_missing" };
  if (estimatedCostMicrousd <= 0) return { ok: false, reason: "price_missing" };
  await client.query("SELECT pg_advisory_xact_lock(hashtext('coreboys:x-api-monthly-spend'))");
  await expireStaleReservations(client);
  const { rows } = await client.query<{ spent: string }>(`
    SELECT (
      COALESCE((SELECT SUM(estimated_cost_microusd) FROM x_api_usage
        WHERE created_at >= date_trunc('month',now())),0) +
      COALESCE((SELECT SUM(estimated_cost_microusd) FROM x_action_audit
        WHERE status='pending' AND created_at >= date_trunc('month',now())),0) +
      COALESCE((SELECT SUM(reserved_microusd) FROM x_api_reservations
        WHERE status='pending' AND expires_at>now()
          AND created_at >= date_trunc('month',now())),0)
    )::text AS spent
  `);
  const spent = Number(rows[0]?.spent ?? 0);
  const cap = Math.round(Math.min(env.monthlyCeilingUsd, env.declaredCreditBalanceUsd) * MICRO_USD);
  return spent + estimatedCostMicrousd <= cap
    ? { ok: true }
    : { ok: false, reason: "monthly_ceiling_reached" };
}

async function expireStaleReservations(client: PoolClient): Promise<void> {
  await client.query(
    `UPDATE x_api_reservations
        SET status='expired',reconciled_at=now()
      WHERE status='pending' AND expires_at<=now()`,
  );
}

/**
 * Reserve the maximum possible charge before a paid X read starts. The row is
 * committed before an outbound feed request and counted by every writer under
 * the same monthly advisory lock. A crashed worker cannot hold the budget
 * forever: unreconciled rows expire after a short lease.
 */
export async function reserveXApiBudgetInTransaction(
  client: PoolClient,
  input: {
    category: "read" | "write";
    operation: string;
    worstCaseMicrousd: number;
    credentialsReady: boolean;
  },
): Promise<{ ok: true; reservation: XApiBudgetReservation } | { ok: false; reason: XBudgetGateReason }> {
  const env = xNativeActionsEnvironment();
  const worstCase = Math.max(0, Math.trunc(input.worstCaseMicrousd));
  if (!input.credentialsReady) return { ok: false, reason: "credentials_missing" };
  if (!env.creditGate || env.monthlyCeilingUsd <= 0) {
    return { ok: false, reason: "credit_gate_missing" };
  }
  if (worstCase <= 0) return { ok: false, reason: "price_missing" };

  await client.query("SELECT pg_advisory_xact_lock(hashtext('coreboys:x-api-monthly-spend'))");
  await expireStaleReservations(client);
  const { rows } = await client.query<{ spent: string }>(`
    SELECT (
      COALESCE((SELECT SUM(estimated_cost_microusd) FROM x_api_usage
        WHERE created_at >= date_trunc('month',now())),0) +
      COALESCE((SELECT SUM(estimated_cost_microusd) FROM x_action_audit
        WHERE status='pending' AND created_at >= date_trunc('month',now())),0) +
      COALESCE((SELECT SUM(reserved_microusd) FROM x_api_reservations
        WHERE status='pending' AND expires_at>now()
          AND created_at >= date_trunc('month',now())),0)
    )::text AS spent
  `);
  const spent = Number(rows[0]?.spent ?? 0);
  const cap = Math.round(Math.min(env.monthlyCeilingUsd, env.declaredCreditBalanceUsd) * MICRO_USD);
  if (spent + worstCase > cap) return { ok: false, reason: "monthly_ceiling_reached" };

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO x_api_reservations(category,operation,reserved_microusd,status,expires_at)
     VALUES($1,$2,$3,'pending',now()+($4::text||' minutes')::interval)
     RETURNING id::text`,
    [input.category, input.operation.slice(0, 80), worstCase, String(RESERVATION_MINUTES)],
  );
  return {
    ok: true,
    reservation: { id: inserted.rows[0]!.id, reservedMicrousd: worstCase },
  };
}

export async function reserveXApiBudget(input: {
  category: "read" | "write";
  operation: string;
  worstCaseMicrousd: number;
  credentialsReady: boolean;
}): Promise<{ ok: true; reservation: XApiBudgetReservation } | { ok: false; reason: XBudgetGateReason }> {
  await ensureXIntegrationSchema();
  return withTransaction((client) => reserveXApiBudgetInTransaction(client, input));
}

/**
 * Replace a worst-case lease with the charge represented by the resources
 * actually returned/attempted. Reconciliation is idempotent: only the first
 * caller can turn a pending reservation into a ledger entry.
 */
export async function reconcileXApiReservationInTransaction(
  client: PoolClient,
  input: {
    reservationId: string;
    endpoint: string;
    operation: string;
    resourceCount: number;
    actualCostMicrousd: number;
    success: boolean;
    userId?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<boolean> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('coreboys:x-api-monthly-spend'))");
  await expireStaleReservations(client);
  const current = await client.query<XApiReservationRow>(
    `SELECT id::text,category,operation,reserved_microusd::text,status
       FROM x_api_reservations WHERE id=$1 FOR UPDATE`,
    [input.reservationId],
  );
  const row = current.rows[0];
  if (!row || row.status !== "pending") return false;

  const resources = Math.max(0, Math.trunc(input.resourceCount));
  const actual = Math.max(0, Math.trunc(input.actualCostMicrousd));
  await client.query(
    `UPDATE x_api_reservations
        SET status='reconciled',actual_microusd=$2,reconciled_at=now()
      WHERE id=$1 AND status='pending'`,
    [row.id, actual],
  );
  await client.query(
    `INSERT INTO x_api_usage
       (category,endpoint,operation,resource_count,estimated_cost_microusd,cache_hit,success,user_id,idempotency_key)
     VALUES($1,$2,$3,$4,$5,false,$6,$7,$8)`,
    [
      row.category,
      input.endpoint.slice(0, 160),
      input.operation.slice(0, 80) || row.operation,
      resources,
      actual,
      input.success,
      input.userId ?? null,
      input.idempotencyKey?.slice(0, 120) ?? null,
    ],
  );
  return true;
}

export async function reconcileXApiReservation(input: {
  reservationId: string;
  endpoint: string;
  operation: string;
  resourceCount: number;
  actualCostMicrousd: number;
  success: boolean;
  userId?: string | null;
  idempotencyKey?: string | null;
}): Promise<boolean> {
  await ensureXIntegrationSchema();
  return withTransaction((client) => reconcileXApiReservationInTransaction(client, input));
}

export async function pruneExpiredXCache(): Promise<number> {
  await ensureXIntegrationSchema();
  return withTransaction(async (client) => {
    const result = await client.query("DELETE FROM x_api_cache WHERE expires_at < now() - interval '7 days'");
    return result.rowCount ?? 0;
  });
}
