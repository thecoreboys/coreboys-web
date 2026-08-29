"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CreditCard01, Receipt } from "@untitledui/icons";

type Summary = {
  configured: boolean;
  billingProfile?: boolean;
  currentAmountCents?: number | null;
  nextChargeAt?: string | null;
  cancellationScheduled?: boolean;
  thresholdCancellation?: boolean;
  serviceShutdownCancellation?: boolean;
  serviceWindDown?: boolean;
  canUpdateAmount?: boolean;
  priceWarning?: null | { kind: string; message: string; effectiveAt: string | null };
  cards?: Array<{ id: string; brand: string; last4: string; expMonth: number | null; expYear: number | null }>;
  invoices?: Array<{ id: string; number: string | null; createdAt: number; amountPaidCents: number; amountDueCents: number; currency: string; status: string; hostedInvoiceUrl: string | null; invoicePdf: string | null }>;
};

const money = (cents: number, currency = "usd") => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
const date = (value: string | number | null | undefined) => value ? new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;

export function BillingSummaryCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    void fetch("/api/account/billing/summary", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setSummary(data))
      .catch(() => setSummary(null));
  }, []);

  if (!summary) {
    return (
      <section className="mt-6 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-5">
        <div className="flex items-center gap-2"><CreditCard01 className="size-5" /><h2 className="font-semibold text-[color:var(--ink)]">Billing</h2></div>
        <p className="mt-2 text-sm text-[color:var(--ink-dim)]">Billing details are temporarily unavailable.</p>
        <Link href="/account/plan" className="mt-4 inline-flex text-sm font-semibold text-[color:var(--ink)] underline underline-offset-4">View support options</Link>
      </section>
    );
  }

  const effective = date(summary.priceWarning?.effectiveAt);
  const warning = summary.priceWarning ? (
    <div className="mt-4 rounded-xl border border-warning_subtle bg-warning-primary p-3 text-sm text-primary" role="status">
      <p className="flex items-start gap-2 font-semibold"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Important billing notice</p>
      <p className="mt-1 leading-6">{summary.priceWarning.message}{effective ? ` Effective ${effective}.` : ""}</p>
      {summary.thresholdCancellation ? <p className="mt-1 font-semibold">{summary.canUpdateAmount ? "Choose a valid renewal amount in Billing to keep the subscription active." : "Resolve the subscription's payment status in the Stripe billing portal, then return to Billing to choose an amount in range."}</p> : null}
      {summary.serviceShutdownCancellation ? <p className="mt-1 font-semibold">Future renewals have been stopped; no new renewal amount can be selected.</p> : null}
    </div>
  ) : null;

  if (!summary.configured || !summary.billingProfile) {
    return (
      <section className="mt-6 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-5">
        <div className="flex items-center gap-2"><CreditCard01 className="size-5" /><h2 className="font-semibold text-[color:var(--ink)]">Billing</h2></div>
        <p className="mt-2 text-sm text-[color:var(--ink-dim)]">No supporter payment method is currently available here. Site support is optional.</p>
        {warning}
        <Link href="/account/plan" className="mt-4 inline-flex text-sm font-semibold text-[color:var(--ink)] underline underline-offset-4">View support options</Link>
      </section>
    );
  }

  const next = date(summary.nextChargeAt);
  return (
    <section className="mt-6 rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><CreditCard01 className="size-5" /><h2 className="font-semibold text-[color:var(--ink)]">Billing & receipts</h2></div>
          <p className="mt-1 text-sm text-[color:var(--ink-dim)]">
            {typeof summary.currentAmountCents === "number" ? `${money(summary.currentAmountCents)}/month · ` : ""}
            {summary.cancellationScheduled ? "Cancellation is scheduled at the end of the paid period." : next ? `Next recurring charge: ${next}.` : "Managed securely by Stripe."}
          </p>
        </div>
        <Link href="/account/plan" className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[color:var(--rule)] px-3 text-sm font-semibold text-[color:var(--ink)]">Manage billing <ArrowUpRight className="size-4" /></Link>
      </div>

      {warning}

      {summary.cards?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {summary.cards.map((card) => <span key={card.id} className="rounded-lg border border-[color:var(--rule)] px-3 py-2 text-sm text-[color:var(--ink-dim)]">{card.brand.toUpperCase()} ···· {card.last4}{card.expMonth && card.expYear ? ` · ${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}` : ""}</span>)}
        </div>
      ) : null}

      <div className="mt-5 border-t border-[color:var(--rule)] pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-dim)]">Invoices & receipts</p>
        <div className="mt-3 space-y-2">
          {summary.invoices?.slice(0, 5).map((invoice) => (
            <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-[color:var(--ink-dim)]"><strong className="text-[color:var(--ink)]">{money(invoice.amountPaidCents || invoice.amountDueCents, invoice.currency)}</strong> · {invoice.status} · {date(invoice.createdAt)}</span>
              {invoice.hostedInvoiceUrl || invoice.invoicePdf ? <a className="inline-flex items-center gap-1 font-semibold text-[color:var(--ink)] underline underline-offset-4" href={invoice.hostedInvoiceUrl ?? invoice.invoicePdf ?? undefined} target="_blank" rel="noreferrer"><Receipt className="size-4" /> {invoice.number ?? "Invoice"}</a> : null}
            </div>
          ))}
          {!summary.invoices?.length ? <p className="text-sm text-[color:var(--ink-dim)]">Your invoices will appear here after Stripe confirms them.</p> : null}
        </div>
      </div>
    </section>
  );
}
