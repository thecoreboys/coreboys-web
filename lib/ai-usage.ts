import "server-only";

import { randomUUID } from "node:crypto";
import { query, withTransaction } from "@/lib/db";

export type AiProvider = "anthropic" | "elevenlabs";
export type AiUsageDecision =
  | { ok: true; reservationId: string }
  | { ok: false; reason: "disabled" | "daily_limit" | "subject_limit" | "monthly_budget" | "unavailable" };

type ProviderControl = {
  provider: AiProvider;
  enabled: boolean;
  daily_request_limit: number;
  per_subject_hour_limit: number;
  monthly_budget_cents: number;
};

const MODEL_COST_MICRO_USD: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
};

const CONSERVATIVE_FALLBACK_RATE = { input: 3, output: 15 } as const;

function estimatedCostMicroUsd(model: string, inputTokens: number, outputTokens: number) {
  const rate = MODEL_COST_MICRO_USD[model];
  // Unknown models are deliberately reserved at a conservative Sonnet rate.
  const selected = rate ?? CONSERVATIVE_FALLBACK_RATE;
  return Math.max(0, Math.ceil(inputTokens) * selected.input + Math.ceil(outputTokens) * selected.output);
}

export async function reserveAiUsage(input: {
  provider: AiProvider;
  feature: string;
  model: string;
  subjectKey?: string | null;
  estimatedInputTokens: number;
  maxOutputTokens: number;
}): Promise<AiUsageDecision> {
  const estimate = estimatedCostMicroUsd(input.model, input.estimatedInputTokens, input.maxOutputTokens);
  const id = randomUUID();
  try {
    return await withTransaction(async (client) => {
      const controls = await client.query<ProviderControl>(
        `SELECT provider, enabled, daily_request_limit, per_subject_hour_limit, monthly_budget_cents
           FROM ai_provider_controls WHERE provider = $1 FOR UPDATE`,
        [input.provider],
      );
      const control = controls.rows[0];
      if (!control) return { ok: false as const, reason: "unavailable" as const };
      if (!control.enabled) return { ok: false as const, reason: "disabled" as const };

      const daily = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ai_usage_events
          WHERE provider = $1 AND created_at >= date_trunc('day', now())
            AND status IN ('reserved', 'completed')`,
        [input.provider],
      );
      if (Number(daily.rows[0]?.count ?? 0) >= control.daily_request_limit) {
        return { ok: false as const, reason: "daily_limit" as const };
      }

      if (input.subjectKey) {
        const subject = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ai_usage_events
            WHERE provider = $1 AND subject_key = $2 AND created_at >= now() - interval '1 hour'
              AND status IN ('reserved', 'completed')`,
          [input.provider, input.subjectKey],
        );
        if (Number(subject.rows[0]?.count ?? 0) >= control.per_subject_hour_limit) {
          return { ok: false as const, reason: "subject_limit" as const };
        }
      }

      const month = await client.query<{ spend: string }>(
        `SELECT COALESCE(sum(COALESCE(actual_cost_microusd, estimated_cost_microusd)), 0)::text AS spend
           FROM ai_usage_events WHERE provider = $1 AND created_at >= date_trunc('month', now())
             AND status IN ('reserved', 'completed')`,
        [input.provider],
      );
      if (Number(month.rows[0]?.spend ?? 0) + estimate > control.monthly_budget_cents * 10_000) {
        return { ok: false as const, reason: "monthly_budget" as const };
      }

      await client.query(
        `INSERT INTO ai_usage_events
          (id, provider, feature, model, subject_key, estimated_input_tokens, reserved_output_tokens, estimated_cost_microusd, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reserved')`,
        [id, input.provider, input.feature, input.model, input.subjectKey ?? null, Math.ceil(input.estimatedInputTokens), Math.ceil(input.maxOutputTokens), estimate],
      );
      return { ok: true as const, reservationId: id };
    });
  } catch (error) {
    console.error("[ai-usage] failed closed", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function settleAiUsage(id: string, input: { model: string; inputTokens: number; outputTokens: number }) {
  const cost = estimatedCostMicroUsd(input.model, input.inputTokens, input.outputTokens);
  await query(
    `UPDATE ai_usage_events SET input_tokens = $2, output_tokens = $3,
       actual_cost_microusd = $4, status = 'completed', completed_at = now()
     WHERE id = $1 AND status = 'reserved'`,
    [id, Math.ceil(input.inputTokens), Math.ceil(input.outputTokens), cost],
  );
}

export async function cancelAiUsage(id: string) {
  await query(`UPDATE ai_usage_events SET status = 'cancelled', completed_at = now() WHERE id = $1 AND status = 'reserved'`, [id]);
}

export async function getAiUsageDashboard() {
  const [controls, today, month] = await Promise.all([
    query<ProviderControl>(`SELECT provider, enabled, daily_request_limit, per_subject_hour_limit, monthly_budget_cents FROM ai_provider_controls ORDER BY provider`),
    query<{ provider: AiProvider; requests: string }>(`SELECT provider, count(*)::text AS requests FROM ai_usage_events WHERE created_at >= date_trunc('day', now()) AND status IN ('reserved', 'completed') GROUP BY provider`),
    query<{ provider: AiProvider; spend: string }>(`SELECT provider, COALESCE(sum(COALESCE(actual_cost_microusd, estimated_cost_microusd)), 0)::text AS spend FROM ai_usage_events WHERE created_at >= date_trunc('month', now()) AND status IN ('reserved', 'completed') GROUP BY provider`),
  ]);
  return controls.rows.map((control) => ({
    provider: control.provider,
    enabled: control.enabled,
    dailyRequestLimit: control.daily_request_limit,
    subjectHourlyLimit: control.per_subject_hour_limit,
    monthlyBudgetCents: control.monthly_budget_cents,
    requestsToday: Number(today.rows.find((entry) => entry.provider === control.provider)?.requests ?? 0),
    monthSpendMicroUsd: Number(month.rows.find((entry) => entry.provider === control.provider)?.spend ?? 0),
  }));
}

export async function updateAiProviderControl(input: {
  provider: AiProvider; enabled: boolean; dailyRequestLimit: number; subjectHourlyLimit: number; monthlyBudgetCents: number; actorId: string;
}) {
  await withTransaction(async (client) => {
    const current = await client.query<ProviderControl>(
      `SELECT provider, enabled, daily_request_limit, per_subject_hour_limit, monthly_budget_cents
         FROM ai_provider_controls WHERE provider = $1 FOR UPDATE`,
      [input.provider],
    );
    const before = current.rows[0];
    if (!before) throw new Error("AI provider control is missing.");
    const after = { enabled: input.enabled, dailyRequestLimit: input.dailyRequestLimit, subjectHourlyLimit: input.subjectHourlyLimit, monthlyBudgetCents: input.monthlyBudgetCents };
    await client.query(
      `UPDATE ai_provider_controls SET enabled = $2, daily_request_limit = $3, per_subject_hour_limit = $4, monthly_budget_cents = $5, updated_by = $6, updated_at = now()
        WHERE provider = $1`,
      [input.provider, input.enabled, input.dailyRequestLimit, input.subjectHourlyLimit, input.monthlyBudgetCents, input.actorId],
    );
    await client.query(
      `INSERT INTO ai_provider_control_audit (provider, actor_id, before, after) VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [input.provider, input.actorId, JSON.stringify({ enabled: before.enabled, dailyRequestLimit: before.daily_request_limit, subjectHourlyLimit: before.per_subject_hour_limit, monthlyBudgetCents: before.monthly_budget_cents }), JSON.stringify(after)],
    );
  });
}
