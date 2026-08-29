"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart01,
  CreditCard01,
  CurrencyDollarCircle,
  RefreshCcw01,
  Users01,
} from "@untitledui/icons";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartLegendContent, ChartTooltipContent } from "@/components/application/charts/charts-base";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

type Controls = {
  minimumAmountCents: number;
  maximumAmountCents: number;
  defaultAmountCents: number;
  subscriberNotice: string | null;
  noticeEffectiveAt: string | null;
  noticePublishedAt: string | null;
  renewalsDisabledAt: string | null;
  updatedAt: string | null;
};

type FinancePoint = { date: string; grossCents: number; feesCents: number; refundsCents: number; netCents: number };
type SubscriptionPoint = { date: string; active: number; started: number; canceled: number };

type Desk = {
  configured: boolean;
  stripeMode: "test" | "live" | "unknown";
  controls: Controls;
  analyticsErrors: string[];
  finance: null | {
    rangeStart: string;
    rangeEnd: string;
    currency: string;
    scope: "stripe_account";
    grossCents: number;
    feesCents: number;
    refundsCents: number;
    netCents: number;
    daily: FinancePoint[];
  };
  subscriptions: null | {
    active: number;
    trialing: number;
    pastDue: number;
    recovering: number;
    canceling: number;
    outsideRange: number;
    totalKnown: number;
    daily: SubscriptionPoint[] | null;
  };
  charges: Array<{ id: string; createdAt: number; amountCents: number; amountRefundedCents: number; currency: string; status: string; paymentIntentId: string | null; receiptUrl: string | null; description: string | null }>;
  refunds: Array<{ id: string; createdAt: number; amountCents: number; currency: string; status: string; reason: string | null }>;
  invoices: Array<{ id: string; number: string | null; createdAt: number; amountPaidCents: number; currency: string; status: string; hostedInvoiceUrl: string | null; invoicePdf: string | null }>;
};

const money = (cents: number, currency = "usd") => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
const PRICE_NOTICE_DAYS = 30;
const DAY_MS = 86_400_000;
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-secondary shadow-xs transition hover:bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-solid px-3 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-solid_hover disabled:cursor-not-allowed disabled:opacity-50";
const input = "mt-1 min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary shadow-xs outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultNoticeDateTime() {
  return localDateTime(new Date(Date.now() + (PRICE_NOTICE_DAYS + 1) * DAY_MS).toISOString());
}

function adminErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : "Billing action failed.";
  if (message === "notice_required") return "Publish a clear subscriber notice before restricting the range or scheduling cancellations.";
  if (message === "notice_effective_date_required") return "Set a subscriber deadline before scheduling threshold cancellations.";
  if (message === "notice_period_too_short") return `Give subscribers at least ${PRICE_NOTICE_DAYS} days between publishing the notice and its deadline.`;
  if (message === "notice_not_effective") return "The subscriber deadline has not arrived yet. No subscriptions were changed.";
  if (message === "billing_controls_busy") return "Another billing action is using the contribution rules. Wait a moment, refresh, and retry.";
  if (message === "refund_operation_in_progress") return "That refund is still being reconciled with Stripe. Wait a moment and retry; the same operation will not create a second refund.";
  if (message === "refund_operation_mismatch") return "That refund operation ID was already used for different details. Refresh before submitting another refund.";
  return message;
}

function dateLabel(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function BillingControlRoom() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [minimumDollars, setMinimumDollars] = useState("5");
  const [maximumDollars, setMaximumDollars] = useState("500");
  const [defaultDollars, setDefaultDollars] = useState("10");
  const [subscriberNotice, setSubscriberNotice] = useState("");
  const [noticeEffectiveAt, setNoticeEffectiveAt] = useState("");
  const [shutdownReason, setShutdownReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refundOperationIds = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/billing", { cache: "no-store" });
    const data = await response.json() as Desk & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to load billing.");
    setDesk(data);
    setMinimumDollars(String(data.controls.minimumAmountCents / 100));
    setMaximumDollars(String(data.controls.maximumAmountCents / 100));
    setDefaultDollars(String(data.controls.defaultAmountCents / 100));
    setSubscriberNotice(data.controls.subscriberNotice ?? "");
    setNoticeEffectiveAt(localDateTime(data.controls.noticeEffectiveAt) || defaultNoticeDateTime());
  }, []);

  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load billing.")); }, [load]);

  async function act(payload: Record<string, unknown>, kind: string) {
    setBusy(kind); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/admin/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string; affected?: number; failed?: number; consentRequired?: number; controlsChanged?: boolean; metadataRepairNeeded?: number; orphanCancellationFailed?: number; checkoutSessionsExpired?: number; checkoutSessionsFailed?: number };
      if (!response.ok) throw new Error(data.error ?? "Billing action failed.");
      if (kind === "cancel") {
        setNotice(data.controlsChanged
          ? `The scan stopped because another admin changed the contribution rules. ${data.affected ?? 0} subscriptions were scheduled before the change; refresh and run the scan again to evaluate every remaining contract against the current rules.`
          : `${data.affected ?? 0} out-of-range subscriptions are scheduled to end after their paid periods${data.failed ? `; ${data.failed} need review` : ""}.`);
      } else if (kind === "shutdown") {
        setNotice(`${data.affected ?? 0} supporter subscriptions were newly scheduled to end after their paid periods; ${data.checkoutSessionsExpired ?? 0} open Checkout sessions were closed${data.failed || data.checkoutSessionsFailed ? `; ${(data.failed ?? 0) + (data.checkoutSessionsFailed ?? 0)} operations need review` : ""}${data.metadataRepairNeeded ? `; ${data.metadataRepairNeeded} Stripe subscriptions need user-metadata repair${data.orphanCancellationFailed ? `, including ${data.orphanCancellationFailed} whose period-end cancellation was not confirmed and requires immediate Stripe review` : ""}` : ""}. New checkout is durably blocked; disabling the deployment flag is an additional safeguard.`);
      } else if (kind === "refund") {
        setNotice("Refund submitted to Stripe.");
      } else {
        setNotice("Contribution rules and customer notice saved.");
      }
      await load().catch(() => setError("The financial action succeeded, but the live dashboard refresh failed. Refresh before taking another action."));
      return true;
    } catch (reason) {
      setError(adminErrorMessage(reason));
      return false;
    } finally { setBusy(null); }
  }

  async function refundRemaining(paymentIntentId: string, amountCents: number) {
    if (!window.confirm(`Refund ${money(amountCents)} to the original payment method?`)) return;
    const key = `${paymentIntentId}:${amountCents}`;
    const operationId = refundOperationIds.current.get(key) ?? crypto.randomUUID();
    refundOperationIds.current.set(key, operationId);
    const succeeded = await act({ action: "refund", operationId, paymentIntentId, amountCents, confirmation: "REFUND" }, "refund");
    if (succeeded) refundOperationIds.current.delete(key);
  }

  const controlCents = useMemo(() => ({
    minimum: Math.round(Number(minimumDollars) * 100),
    maximum: Math.round(Number(maximumDollars) * 100),
    default: Math.round(Number(defaultDollars) * 100),
  }), [defaultDollars, maximumDollars, minimumDollars]);
  const controlsValid = Number.isSafeInteger(controlCents.minimum)
    && Number.isSafeInteger(controlCents.maximum)
    && Number.isSafeInteger(controlCents.default)
    && controlCents.minimum >= 500
    && controlCents.maximum <= 50_000
    && controlCents.minimum <= controlCents.default
    && controlCents.default <= controlCents.maximum;
  const noticeDate = noticeEffectiveAt ? new Date(noticeEffectiveAt) : null;
  const noticeIso = noticeDate && Number.isFinite(noticeDate.getTime()) ? noticeDate.toISOString() : null;
  const publishedAtMs = Date.parse(desk?.controls.noticePublishedAt ?? "");
  const effectiveAtMs = Date.parse(desk?.controls.noticeEffectiveAt ?? "");
  const cancellationReady = Boolean(
    desk?.controls.subscriberNotice
    && Number.isFinite(publishedAtMs)
    && Number.isFinite(effectiveAtMs)
    && effectiveAtMs - publishedAtMs >= PRICE_NOTICE_DAYS * DAY_MS
    && effectiveAtMs <= Date.now(),
  );
  const windDownActive = Boolean(desk?.controls.renewalsDisabledAt);

  if (!desk) {
    if (error) return <div className="rounded-xl border border-error_subtle bg-error-primary p-5 text-sm text-primary" role="alert"><p>{error}</p><button className={`${button} mt-3`} onClick={() => { setError(null); void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load billing.")); }}>Try again</button></div>;
    return <div className="h-64 animate-pulse rounded-xl bg-primary" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm leading-relaxed text-tertiary">Stripe net proceeds are not accounting profit: taxes, hosting, payroll, and other operating costs are not included. The finance graph covers account-wide USD charges and refunds, so shared postcard activity may appear.</p>
        <div className="flex items-center gap-2">
          {windDownActive ? <span className="rounded-full bg-error-secondary px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-error-primary">renewals stopped</span> : null}
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${desk.stripeMode === "test" ? "bg-warning-secondary text-warning-primary" : desk.stripeMode === "live" ? "bg-success-secondary text-success-primary" : "bg-secondary text-tertiary"}`}>{desk.stripeMode} Stripe</span>
          <button className={button} onClick={() => void load()} disabled={busy !== null}><RefreshCcw01 className="size-4" />Refresh</button>
        </div>
      </div>
      {error ? <p className="rounded-lg border border-error_subtle bg-error-primary p-3 text-sm text-primary" role="alert">{error}</p> : null}
      {notice ? <p className="rounded-lg border border-success_subtle bg-success-primary p-3 text-sm text-primary" role="status">{notice}</p> : null}
      {desk.analyticsErrors.length ? <div className="rounded-lg border border-warning_subtle bg-warning-primary p-3 text-sm text-primary" role="status"><p className="font-semibold">Some live Stripe data could not be loaded. Billing controls remain available.</p><ul className="mt-1 list-disc pl-5">{desk.analyticsErrors.map((message) => <li key={message}>{message}</li>)}</ul></div> : null}

      <section className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary">
        <div className="flex items-start gap-3"><FeaturedIcon icon={CreditCard01} size="md" color="brand" theme="modern" /><div><h2 className="text-lg font-semibold text-primary">Contribution rules & customer notice</h2><p className="mt-1 text-sm text-tertiary">Hard safety rails remain $5–$500. New checkout uses the saved default; restrictive range changes require a visible subscriber notice.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <MoneyField label="Minimum monthly support" min="5" max="500" value={minimumDollars} onChange={setMinimumDollars} />
          <MoneyField label="Default at new checkout" min={minimumDollars || "5"} max={maximumDollars || "500"} value={defaultDollars} onChange={setDefaultDollars} />
          <MoneyField label="Maximum monthly support" min="5" max="500" value={maximumDollars} onChange={setMaximumDollars} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <label className="text-xs font-semibold text-tertiary">Billing-area notice<textarea className={`${input} min-h-28 py-2`} minLength={10} maxLength={1000} value={subscriberNotice} onChange={(event) => setSubscriberNotice(event.target.value)} placeholder="Explain the new amount or threshold, the deadline, and that an out-of-range subscription may end after its paid period." /></label>
          <label className="text-xs font-semibold text-tertiary">Subscriber deadline / effective date<input className={input} type="datetime-local" value={noticeEffectiveAt} onChange={(event) => setNoticeEffectiveAt(event.target.value)} /><span className="mt-1 block font-normal leading-5 text-quaternary">Restrictive threshold changes require at least {PRICE_NOTICE_DAYS} days of notice. New checkout limits change immediately.</span></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className={primaryButton} disabled={busy !== null || !controlsValid} onClick={() => void act({ action: "set_controls", minimumAmountCents: controlCents.minimum, maximumAmountCents: controlCents.maximum, defaultAmountCents: controlCents.default, subscriberNotice: subscriberNotice.trim() || null, noticeEffectiveAt: subscriberNotice.trim() ? noticeIso : null }, "controls")}>Save rules and publish notice</button>
          <button className={button} disabled={windDownActive || !desk.configured || busy !== null || !desk.subscriptions?.outsideRange || !cancellationReady} title={cancellationReady ? undefined : `Available only after a published ${PRICE_NOTICE_DAYS}-day subscriber deadline has passed.`} onClick={() => { if (window.confirm(`Schedule ${desk.subscriptions?.outsideRange ?? 0} out-of-range subscriptions to end after their current paid periods? No immediate cancellations or refunds will occur.`)) void act({ action: "cancel_out_of_range", confirmation: "CANCEL OUT OF RANGE" }, "cancel"); }}><AlertTriangle className="size-4" />Schedule out-of-range cancellations</button>
        </div>
      </section>

      <section className="rounded-xl border border-error_subtle bg-primary p-5">
        <div className="flex items-start gap-3"><FeaturedIcon icon={AlertTriangle} size="md" color="error" theme="modern" /><div><h2 className="text-lg font-semibold text-primary">Service shutdown</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-tertiary">This action durably blocks new checkout and schedules every active or recovering supporter contract to stop renewing at the end of its current paid period. Keep Stripe webhooks and the billing portal running through the wind-down.</p>{desk.controls.renewalsDisabledAt ? <p className="mt-2 text-sm font-semibold text-error-primary">Wind-down began {new Date(desk.controls.renewalsDisabledAt).toLocaleString("en-US")}. Re-run the scan below if any contracts need reconciliation.</p> : null}</div></div>
        <label className="mt-4 block max-w-3xl text-xs font-semibold text-tertiary">Internal shutdown reason<textarea className={`${input} min-h-24 py-2`} minLength={10} maxLength={500} value={shutdownReason} onChange={(event) => setShutdownReason(event.target.value)} placeholder="Record why all supporter renewals are being stopped." /></label>
        <button className={`${button} mt-3 border-error_subtle text-error-primary`} disabled={!desk.configured || busy !== null || shutdownReason.trim().length < 10} onClick={() => { if (window.confirm("Durably stop new supporter checkout and schedule every supporter subscription to end after its current paid period?")) void act({ action: "cancel_all_supporters", reason: shutdownReason.trim(), confirmation: "CANCEL ALL SUPPORTERS" }, "shutdown"); }}><AlertTriangle className="size-4" />{windDownActive ? "Re-run supporter cancellation scan" : "Stop all future supporter renewals"}</button>
      </section>

      {desk.finance || desk.subscriptions ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {desk.finance ? <><Metric icon={CurrencyDollarCircle} label="30-day gross" value={money(desk.finance.grossCents)} /><Metric icon={CreditCard01} label="Stripe fees" value={money(desk.finance.feesCents)} /><Metric icon={RefreshCcw01} label="Refunds" value={money(desk.finance.refundsCents)} /><Metric icon={BarChart01} label="Stripe net proceeds" value={money(desk.finance.netCents)} /></> : null}
            {desk.subscriptions ? <Metric icon={Users01} label="Current supporter contracts" value={String(desk.subscriptions.active + desk.subscriptions.trialing + desk.subscriptions.pastDue + desk.subscriptions.recovering)} supporting={`${desk.subscriptions.recovering} recovering · ${desk.subscriptions.canceling} canceling · ${desk.subscriptions.outsideRange} out of range`} /> : null}
          </section>
          <section className="grid gap-5 xl:grid-cols-2">
            {desk.finance ? <FinanceChart data={desk.finance.daily} /> : <AnalyticsUnavailable title="Net proceeds by day" />}
            {desk.subscriptions?.daily ? <SubscriptionChart data={desk.subscriptions.daily} /> : <AnalyticsUnavailable title="Supporter subscriptions by day" />}
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-warning_subtle bg-warning-primary p-4 text-sm text-primary">Stripe membership operations are not configured. Add a matching test or live key pair and the membership webhook secret. New checkout additionally requires the membership switch.</section>
      )}

      <section className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary">
        <h2 className="text-lg font-semibold text-primary">Recent Stripe-account charges</h2>
        <p className="mt-1 text-xs text-tertiary">Account-wide reconciliation list; it can include supporter and postcard charges.</p>
        <div className="mt-4 space-y-2">{desk.charges.map((charge) => <div key={charge.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-secondary p-3 text-sm"><span><strong>{money(charge.amountCents, charge.currency)}</strong> · {charge.status}{charge.amountRefundedCents ? ` · refunded ${money(charge.amountRefundedCents, charge.currency)}` : ""}</span><span className="flex gap-2">{charge.receiptUrl ? <a className={button} href={charge.receiptUrl} target="_blank" rel="noreferrer">Receipt</a> : null}{charge.paymentIntentId && charge.amountRefundedCents < charge.amountCents ? <button className={button} disabled={busy !== null} onClick={() => void refundRemaining(charge.paymentIntentId!, charge.amountCents - charge.amountRefundedCents)}>Refund remaining</button> : null}</span></div>)}{desk.charges.length === 0 ? <p className="text-sm text-tertiary">No Stripe charges available.</p> : null}</div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary"><h2 className="text-lg font-semibold text-primary">Recent invoices</h2><div className="mt-4 space-y-2">{desk.invoices.map((invoice) => <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-lg border border-secondary p-3 text-sm"><span><strong>{money(invoice.amountPaidCents, invoice.currency)}</strong> · {invoice.status}</span>{invoice.hostedInvoiceUrl || invoice.invoicePdf ? <a className={button} href={invoice.hostedInvoiceUrl ?? invoice.invoicePdf ?? undefined} target="_blank" rel="noreferrer">Open invoice</a> : null}</div>)}{desk.invoices.length === 0 ? <p className="text-sm text-tertiary">No Stripe invoices available.</p> : null}</div></div>
        <div className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary"><h2 className="text-lg font-semibold text-primary">Refund history</h2><div className="mt-4 space-y-2">{desk.refunds.map((refund) => <div key={refund.id} className="rounded-lg border border-secondary p-3 text-sm"><strong>{money(refund.amountCents, refund.currency)}</strong> · {refund.status}{refund.reason ? ` · ${refund.reason}` : ""}</div>)}{desk.refunds.length === 0 ? <p className="text-sm text-tertiary">No Stripe refunds available.</p> : null}</div></div>
      </section>
    </div>
  );
}

function MoneyField({ label, min, max, value, onChange, compact = false }: { label: string; min: string; max: string; value: string; onChange: (value: string) => void; compact?: boolean }) {
  return <label className={`text-xs font-semibold text-tertiary ${compact ? "w-56" : ""}`}>{label}<span className="relative block"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-quaternary">$</span><input className={`${input} pl-7`} type="number" min={min} max={max} step="1" value={value} onChange={(event) => onChange(event.target.value)} /></span></label>;
}

function Metric({ icon, label, value, supporting }: { icon: typeof BarChart01; label: string; value: string; supporting?: string }) {
  return <article className="rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-tertiary">{label}</p><FeaturedIcon icon={icon} size="sm" color="brand" theme="modern" /></div><strong className="mt-3 block text-xl text-primary">{value}</strong>{supporting ? <p className="mt-1 text-xs text-tertiary">{supporting}</p> : null}</article>;
}

function FinanceChart({ data }: { data: FinancePoint[] }) {
  const chartData = data.map((point) => ({ ...point, gross: point.grossCents / 100, net: point.netCents / 100, refunds: point.refundsCents / 100 }));
  return <ChartCard title="Net proceeds by day" supporting="Trailing 30 UTC days · account-wide USD charges and refunds"><div className="h-72" aria-label="Daily Stripe gross, refunds, and net proceeds chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}><defs><linearGradient id="billing-net-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7f56d9" stopOpacity={0.28} /><stop offset="100%" stopColor="#7f56d9" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="currentColor" className="text-utility-gray-200" strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={dateLabel} tickLine={false} axisLine={false} minTickGap={28} tick={{ className: "text-xs text-tertiary" }} /><YAxis width={55} tickFormatter={(value) => `$${value}`} tickLine={false} axisLine={false} tick={{ className: "text-xs text-tertiary" }} /><Tooltip isAnimationActive={false} content={<ChartTooltipContent labelFormatter={(value) => dateLabel(String(value))} formatter={(value) => money(Math.round(Number(value) * 100))} />} /><Legend content={<ChartLegendContent />} /><Bar dataKey="gross" name="Gross" fill="#d6bbfb" radius={[3, 3, 0, 0]} /><Bar dataKey="refunds" name="Refunds" fill="#fda29b" radius={[3, 3, 0, 0]} /><Area type="monotone" dataKey="net" name="Net proceeds" stroke="#7f56d9" strokeWidth={2} fill="url(#billing-net-fill)" dot={false} /></ComposedChart></ResponsiveContainer></div></ChartCard>;
}

function SubscriptionChart({ data }: { data: SubscriptionPoint[] }) {
  return <ChartCard title="Supporter subscriptions by day" supporting="Current managed-contract count reconstructed with Stripe starts and cancellations"><div className="h-72" aria-label="Daily managed, started, and canceled supporter subscriptions chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}><CartesianGrid vertical={false} stroke="currentColor" className="text-utility-gray-200" strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={dateLabel} tickLine={false} axisLine={false} minTickGap={28} tick={{ className: "text-xs text-tertiary" }} /><YAxis width={40} allowDecimals={false} tickLine={false} axisLine={false} tick={{ className: "text-xs text-tertiary" }} /><Tooltip isAnimationActive={false} content={<ChartTooltipContent labelFormatter={(value) => dateLabel(String(value))} formatter={(value) => Number(value).toLocaleString("en-US")} />} /><Legend content={<ChartLegendContent />} /><Bar dataKey="started" name="Started" fill="#47cd89" radius={[3, 3, 0, 0]} /><Bar dataKey="canceled" name="Canceled" fill="#f97066" radius={[3, 3, 0, 0]} /><Area type="monotone" dataKey="active" name="Managed" stroke="#7f56d9" strokeWidth={2} fill="#7f56d9" fillOpacity={0.08} dot={false} /></ComposedChart></ResponsiveContainer></div></ChartCard>;
}

function ChartCard({ title, supporting, children }: { title: string; supporting: string; children: React.ReactNode }) {
  return <article className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary"><div className="flex items-start gap-3"><FeaturedIcon icon={BarChart01} size="md" color="brand" theme="modern" /><div><h2 className="font-semibold text-primary">{title}</h2><p className="mt-1 text-xs text-tertiary">{supporting}</p></div></div><div className="mt-4">{children}</div></article>;
}

function AnalyticsUnavailable({ title }: { title: string }) {
  return <article className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary"><h2 className="font-semibold text-primary">{title}</h2><p className="mt-2 text-sm text-tertiary">This live Stripe series is temporarily unavailable. Refresh to try again; billing controls above are unaffected.</p></article>;
}
