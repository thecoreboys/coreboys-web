"use client";

import { useState } from "react";
import { CreditCard, ExternalLink, LoaderCircle } from "lucide-react";
import styles from "./PricingExperience.module.css";

export function MembershipActions({ active, configured }: { active: boolean; configured: boolean }) {
  const [dollars, setDollars] = useState("3");
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function open(endpoint: string, kind: "checkout" | "portal") {
    setError(null); setPending(kind);
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: kind === "checkout" ? { "content-type": "application/json" } : undefined, body: kind === "checkout" ? JSON.stringify({ amountCents: Math.round(Number(dollars) * 100) }) : undefined });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) { setError(messageFor(data.error)); return; }
      window.location.assign(data.url);
    } catch { setError("Billing is temporarily unavailable. Please try again."); }
    finally { setPending(null); }
  }
  if (active) return <div className={styles.billingActions}><button type="button" className={styles.primaryCta} onClick={() => void open("/api/account/billing/portal", "portal")} disabled={!configured || pending !== null}>{pending === "portal" ? <LoaderCircle className={styles.spinner} /> : <CreditCard />}Manage billing <ExternalLink /></button><p>Update your payment method or cancel anytime in the secure Stripe billing portal.</p>{error ? <p className={styles.billingError} role="alert">{error}</p> : null}</div>;
  return <div className={styles.billingActions}><label className={styles.amountField}><span>Your monthly support</span><span className={styles.currency}>$</span><input inputMode="decimal" type="number" min="3" max="1000" step="1" value={dollars} onChange={(event) => setDollars(event.target.value)} aria-describedby="membership-minimum" /><em>/ month</em></label><button type="button" className={styles.primaryCta} onClick={() => void open("/api/account/billing/checkout", "checkout")} disabled={!configured || pending !== null}>{pending === "checkout" ? <LoaderCircle className={styles.spinner} /> : <CreditCard />}Start membership</button><p id="membership-minimum">$3 minimum · cancel anytime · secure checkout by Stripe</p>{!configured ? <p className={styles.billingError} role="status">Membership checkout is being configured. No charge can be made yet.</p> : null}{error ? <p className={styles.billingError} role="alert">{error}</p> : null}</div>;
}

function messageFor(code?: string) {
  if (code === "invalid_amount") return "Choose a monthly amount of at least $3.";
  if (code === "membership_already_active") return "You already have an active membership. Use Manage billing.";
  if (code === "billing_setup_required") return "Billing setup is still finishing. Please try again shortly.";
  if (code === "no_billing_profile") return "No Stripe billing profile is available for this account yet.";
  return "Billing is temporarily unavailable. Please try again.";
}
