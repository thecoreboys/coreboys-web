export const BILLING_ANALYTICS_DAYS = 30;

export type BillingBalanceEntry = {
  created: number;
  type: string;
  reportingCategory?: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
};

export type SubscriptionMovement = {
  created: number;
  kind: "started" | "canceled";
};

export type DailyFinancePoint = {
  date: string;
  grossCents: number;
  feesCents: number;
  refundsCents: number;
  netCents: number;
};

export type DailySubscriptionPoint = {
  date: string;
  active: number;
  started: number;
  canceled: number;
};

function utcDateKey(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

export function billingAnalyticsDateKeys(now = new Date(), days = BILLING_ANALYTICS_DAYS): string[] {
  const dayCount = Math.max(1, Math.trunc(days));
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: dayCount }, (_, index) => (
    new Date(end - (dayCount - index - 1) * 86_400_000).toISOString().slice(0, 10)
  ));
}

export function buildDailyFinanceSeries(
  entries: BillingBalanceEntry[],
  now = new Date(),
  currency = "usd",
): DailyFinancePoint[] {
  const days = billingAnalyticsDateKeys(now);
  const byDate = new Map(days.map((date) => [date, { date, grossCents: 0, feesCents: 0, refundsCents: 0, netCents: 0 }]));

  for (const entry of entries) {
    if (entry.currency.toLowerCase() !== currency.toLowerCase()) continue;
    const category = entry.reportingCategory || entry.type;
    const isCharge = category === "charge" || category === "payment";
    const isRefund = category === "refund"
      || category === "payment_refund"
      || category === "payment_reversal"
      || category === "payment_failure_refund";
    if (!isCharge && !isRefund) continue;
    const point = byDate.get(utcDateKey(entry.created));
    if (!point) continue;
    if (isCharge) point.grossCents += Math.max(0, Math.trunc(entry.amount));
    if (isRefund) point.refundsCents += Math.abs(Math.trunc(entry.amount));
    point.feesCents += Math.trunc(entry.fee);
    point.netCents += Math.trunc(entry.net);
  }

  return days.map((date) => byDate.get(date)!);
}

export function buildDailySubscriptionSeries(
  movements: SubscriptionMovement[],
  currentActive: number,
  now = new Date(),
): DailySubscriptionPoint[] {
  const days = billingAnalyticsDateKeys(now);
  const byDate = new Map(days.map((date) => [date, { date, active: 0, started: 0, canceled: 0 }]));
  for (const movement of movements) {
    const point = byDate.get(utcDateKey(movement.created));
    if (!point) continue;
    if (movement.kind === "started") point.started += 1;
    else point.canceled += 1;
  }

  let activeAtEnd = Math.max(0, Math.trunc(currentActive));
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const point = byDate.get(days[index]!)!;
    point.active = activeAtEnd;
    activeAtEnd = Math.max(0, activeAtEnd - point.started + point.canceled);
  }
  return days.map((date) => byDate.get(date)!);
}
