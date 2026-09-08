/** App-managed AI ceiling. Provider limits may be lower, never additive. */
export const AI_MONTHLY_BUDGET_CENTS = 4_000;
export const AI_BUDGET_MICRO_USD = AI_MONTHLY_BUDGET_CENTS * 10_000;

const MODEL_RATES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
};

export function estimatedAiCostMicroUsd(model: string, inputTokens: number, outputTokens: number) {
  if (![inputTokens, outputTokens].every((value) => Number.isFinite(value) && value >= 0 && value <= 10_000_000)) {
    throw new Error("Invalid AI token reservation");
  }
  // Unknown deployments stay conservative until their billing rate is verified.
  const rate = MODEL_RATES[model] ?? { input: 3, output: 15 };
  return Math.ceil(Math.ceil(inputTokens) * rate.input + Math.ceil(outputTokens) * rate.output);
}

export function fitsAiMonthlyBudget(spendMicroUsd: number, reservationMicroUsd: number) {
  return [spendMicroUsd, reservationMicroUsd].every((value) => Number.isSafeInteger(value) && value >= 0)
    && spendMicroUsd + reservationMicroUsd <= AI_BUDGET_MICRO_USD;
}
