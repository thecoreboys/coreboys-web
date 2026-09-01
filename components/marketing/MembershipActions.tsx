"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, CreditCard, ExternalLink, LoaderCircle } from "lucide-react";
import styles from "./PricingExperience.module.css";

type Bounds = {
  minimumAmountCents: number;
  maximumAmountCents: number;
  defaultAmountCents: number;
  subscriberNotice: string | null;
  noticeEffectiveAt: string | null;
  renewalsDisabledAt: string | null;
};

type BillingSummary = {
  configured: boolean;
  billingProfile?: boolean;
  currentAmountCents?: number | null;
  subscriptionStatus?: string;
  canUpdateAmount?: boolean;
  cancellationScheduled?: boolean;
  thresholdCancellation?: boolean;
  serviceShutdownCancellation?: boolean;
  serviceWindDown?: boolean;
  nextChargeAt?: string | null;
  priceWarning?: null | { kind: "notice" | "outside_range" | "cancellation_scheduled" | "service_shutdown"; message: string; effectiveAt: string | null };
};

const DEFAULT_BOUNDS: Bounds = {
  minimumAmountCents: 500,
  maximumAmountCents: 50_000,
  defaultAmountCents: 1_000,
  subscriberNotice: null,
  noticeEffectiveAt: null,
  renewalsDisabledAt: null,
};

function dollars(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(cents / 100);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;
}

export function MembershipActions({ active, configured }: { active: boolean; configured: boolean }) {
  const [dollarInput, setDollarInput] = useState("10");
  const [bounds, setBounds] = useState<Bounds>(DEFAULT_BOUNDS);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [pending, setPending] = useState<"checkout" | "portal" | "amount" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!active) return;
    const response = await fetch("/api/account/billing/summary", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as BillingSummary;
    setSummary(data);
    if (typeof data.currentAmountCents === "number") setDollarInput(String(data.currentAmountCents / 100));
  }, [active]);

  useEffect(() => {
    void fetch("/api/account/billing/settings", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: Bounds | null) => {
        if (!data) return;
        setBounds(data);
        if (!active) setDollarInput(String(Number(data.defaultAmountCents) / 100));
      }).catch(() => undefined);
    void loadSummary();
  }, [active, loadSummary]);

  const amountCents = Math.round(Number(dollarInput) * 100);
  const validAmount = useMemo(() => Number.isSafeInteger(amountCents)
    && amountCents >= bounds.minimumAmountCents
    && amountCents <= bounds.maximumAmountCents, [amountCents, bounds]);

  async function openPortal() {
    setError(null); setPending("portal");
    try {
      const response = await fetch("/api/account/billing/portal", { method: "POST", credentials: "same-origin" });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) { setError(messageFor(data.error, bounds)); return; }
      window.location.assign(data.url);
    } catch { setError("Billing is temporarily unavailable. Please try again."); }
    finally { setPending(null); }
  }

  async function submitAmount(kind: "checkout" | "amount") {
    setError(null); setNotice(null);
    if (!validAmount) { setError(messageFor("invalid_amount", bounds)); return; }
    if (!termsAccepted) { setError("Confirm the recurring amount and Terms before continuing."); return; }
    setPending(kind);
    try {
      const endpoint = kind === "checkout" ? "/api/account/billing/checkout" : "/api/account/billing/amount";
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents, termsAccepted: true, ...(kind === "amount" ? { operationId: crypto.randomUUID() } : {}) }),
      });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok) { setError(messageFor(data.error, bounds)); return; }
      if (kind === "checkout") {
        if (!data.url) { setError("Billing is temporarily unavailable. Please try again."); return; }
        window.location.assign(data.url);
        return;
      }
      setNotice(`Your next renewal is now ${dollars(amountCents)}. No immediate charge or proration was created.`);
      setTermsAccepted(false);
      await loadSummary();
    } catch { setError("Billing is temporarily unavailable. Please try again."); }
    finally { setPending(null); }
  }

  const minimumCopy = `Support starts at ${dollars(bounds.minimumAmountCents)} per month`;
  const priceWarning = summary?.priceWarning ?? (bounds.subscriberNotice
    ? { kind: "notice" as const, message: bounds.subscriberNotice, effectiveAt: bounds.noticeEffectiveAt }
    : null);
  const priceWarningMessage = priceWarning?.message;
  const effective = dateLabel(priceWarning?.effectiveAt);
  const renewal = dateLabel(summary?.nextChargeAt);
  const checkoutDiscontinued = Boolean(bounds.renewalsDisabledAt);
  function adjustAmount(delta: number) {
    const current = Number(dollarInput);
    const next = (Number.isFinite(current) ? current : bounds.defaultAmountCents / 100) + delta;
    const clamped = Math.min(bounds.maximumAmountCents / 100, Math.max(bounds.minimumAmountCents / 100, next));
    setDollarInput(String(clamped));
  }

  if (active) {
    const operationsConfigured = summary?.configured ?? configured;
    return (
      <div className={styles.billingActions}>
        {priceWarning ? (
          <div className="rounded-xl border border-warning_subtle bg-warning-primary p-3 text-sm text-primary" role="status">
            <p className="flex items-start gap-2 font-semibold"><AlertCircle className="mt-0.5 size-4 shrink-0" /> Billing notice</p>
            <p className="mt-1 leading-6">{priceWarningMessage}{effective ? ` Effective ${effective}.` : ""}</p>
            {summary?.thresholdCancellation ? <p className="mt-1 font-semibold">Your recurring support is scheduled to end{renewal ? ` after ${renewal}` : " after the current paid period"}. {summary.canUpdateAmount ? "Choose a valid monthly amount to continue." : "Resolve the subscription's payment status in the Stripe billing portal, then return here to choose a valid monthly amount."}</p> : null}
          </div>
        ) : null}
        {summary?.canUpdateAmount ? (
          <>
            <AmountField label="Your next monthly renewal" value={dollarInput} bounds={bounds} onChange={setDollarInput} onAdjust={adjustAmount} describedBy="membership-range" />
            <Consent checked={termsAccepted} onChange={setTermsAccepted} amountCents={amountCents} />
            <button type="button" className={styles.primaryCta} onClick={() => void submitAmount("amount")} disabled={!operationsConfigured || pending !== null || !validAmount || !termsAccepted}>
              {pending === "amount" ? <LoaderCircle className={styles.spinner} /> : <CreditCard />}Update next renewal
            </button>
          </>
        ) : null}
        <button type="button" className={styles.primaryCta} onClick={() => void openPortal()} disabled={!operationsConfigured || pending !== null}>
          {pending === "portal" ? <LoaderCircle className={styles.spinner} /> : <CreditCard />}Manage payment or cancel <ExternalLink />
        </button>
        <p id="membership-range">{minimumCopy}. Amount changes apply to the next renewal with no immediate charge. Cancellation remains available through Stripe.</p>
        {notice ? <p className="flex items-start gap-2 rounded-lg border border-success_subtle bg-success-primary p-3 text-sm text-primary" role="status"><CheckCircle className="mt-0.5 size-4 shrink-0" />{notice}</p> : null}
        {error ? <p className={styles.billingError} role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={styles.billingActions}>
      <AmountField label="Your monthly support" value={dollarInput} bounds={bounds} onChange={setDollarInput} onAdjust={adjustAmount} describedBy="membership-minimum" />
      <Consent checked={termsAccepted} onChange={setTermsAccepted} amountCents={amountCents} />
      <button type="button" className={styles.primaryCta} onClick={() => void submitAmount("checkout")} disabled={!configured || checkoutDiscontinued || pending !== null || !validAmount || !termsAccepted}>
        {pending === "checkout" ? <LoaderCircle className={styles.spinner} /> : <CreditCard />}Become a supporter
      </button>
      <p id="membership-minimum">Recurring site support is optional. {minimumCopy} · cancel recurring billing anytime.</p>
      {!configured ? <p className={styles.billingError} role="status">Membership checkout is being configured. No charge can be made yet.</p> : null}
      {checkoutDiscontinued ? <p className={styles.billingError} role="status">New recurring site support has been discontinued.</p> : null}
      {error ? <p className={styles.billingError} role="alert">{error}</p> : null}
    </div>
  );
}

function AmountField({ label, value, bounds, onChange, onAdjust, describedBy }: { label: string; value: string; bounds: Bounds; onChange: (value: string) => void; onAdjust: (delta: number) => void; describedBy: string }) {
  return <label className={styles.amountField}>
    <span>{label}</span><span className={styles.currency}>$</span>
    <span className={styles.amountInputWrap}><input inputMode="decimal" type="number" min={bounds.minimumAmountCents / 100} max={bounds.maximumAmountCents / 100} step="1" value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={describedBy} /><span className={styles.amountStepper}><button type="button" onClick={() => onAdjust(1)} aria-label="Increase monthly amount"><ChevronUp aria-hidden="true" /></button><button type="button" onClick={() => onAdjust(-1)} aria-label="Decrease monthly amount"><ChevronDown aria-hidden="true" /></button></span></span>
    <em>/ month</em>
  </label>;
}

function Consent({ checked, onChange, amountCents }: { checked: boolean; onChange: (value: boolean) => void; amountCents: number }) {
  const amount = Number.isSafeInteger(amountCents) && amountCents > 0 ? dollars(amountCents) : "the selected amount";
  return (
    <label className="flex cursor-pointer items-start gap-2 text-left text-xs leading-5 text-tertiary">
      <input className="mt-1 size-4 shrink-0" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>I authorize {amount} every month until I cancel and agree to the <Link className="font-semibold underline underline-offset-2" href="/legal/terms">Terms</Link>. I am legally able to make this purchase or have the payment owner&apos;s permission.</span>
    </label>
  );
}

function messageFor(code: string | undefined, bounds: Bounds) {
  if (code === "invalid_amount") return `Choose a valid monthly amount. Support starts at ${dollars(bounds.minimumAmountCents)} per month.`;
  if (code === "membership_already_active") return "You already have a membership. Use the renewal amount or billing controls shown here.";
  if (code === "checkout_in_progress") return "A secure Checkout is already open for this account. Finish it or wait about 30 minutes for it to expire before choosing a different amount.";
  if (code === "membership_sync_pending") return "Your completed Checkout is still being confirmed. Do not open another subscription; refresh your billing page in a moment.";
  if (code === "billing_operation_in_progress") return "Another billing update is already in progress. Wait a moment, refresh, and try again.";
  if (code === "billing_controls_busy") return "Contribution rules are being updated. Wait a moment, refresh, and try again.";
  if (code === "membership_discontinued") return "New recurring site support has been discontinued.";
  if (code === "billing_profile_mismatch") return "Billing needs staff review before another subscription can be opened.";
  if (code === "billing_setup_required") return "Billing setup is still finishing. Please try again shortly.";
  if (code === "no_billing_profile") return "No Stripe billing profile is available for this account yet.";
  if (code === "subscription_not_editable") return "This subscription cannot be changed here. Open the Stripe billing portal for available options.";
  return "Billing is temporarily unavailable. Please try again.";
}
