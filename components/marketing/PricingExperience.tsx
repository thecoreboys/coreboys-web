"use client";

import Link from "next/link";
import { ArrowRight, Check, CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";
import type { AccountSubscriptionApiResponse } from "@/lib/subscriptions/api-contract";
import { supporterPriceLabel, useSupporterBillingControls } from "@/hooks/useSupporterBillingControls";
import { MembershipActions } from "./MembershipActions";
import styles from "./PricingExperience.module.css";

type AccountPlanPreview = AccountSubscriptionApiResponse["account"];
const INCLUDED = ["Full access to current CORE beta features", "Multiview rooms, saved layouts, and queues", "Extended history, DVR folders, and notes", "Advanced alerts and account preferences", "Member card customization and profile tools", "Public content remains free for everyone"];
const FEATURE_FOCUS: Record<string, { title: string; copy: string }> = {
  "multiview.expanded": { title: "Expanded multiview", copy: "Watch more live channels in one room." },
  "multiview.saved_layouts": { title: "Saved layouts", copy: "Keep your preferred room setup ready." },
  "rooms.private": { title: "Private rooms", copy: "Bring your people into one shared watch room." },
  "notifications.advanced": { title: "Advanced alerts", copy: "Choose what matters and when CORE should notify you." },
  "dvr.extended_retention": { title: "Private DVR", copy: "Keep broadcasts, videos, and moments ready to revisit." },
};

export function PricingExperience({ accountMode = false, displayName, account, accountLoading = false, accountUnavailable = false, focusFeature }: { accountMode?: boolean; displayName?: string; account?: AccountPlanPreview; accountLoading?: boolean; accountUnavailable?: boolean; focusFeature?: string }) {
  const active = account?.source === "subscription" && ["active", "trialing"].includes(account.status);
  const hasManagedSubscription = Boolean(account?.hasManagedSubscription);
  const configured = Boolean(account?.billingConfigured && !accountUnavailable && account.storageState === "ready");
  const controls = useSupporterBillingControls();
  const supportClosed = Boolean(controls?.renewalsDisabledAt);
  const minimum = controls ? supporterPriceLabel(controls.minimumAmountCents) : null;
  const joinLabel = supportClosed ? "Recurring support closed" : minimum ? `Join from ${minimum}/mo` : "Join the CORE beta";
  const requestedFeature = focusFeature ? FEATURE_FOCUS[focusFeature] : undefined;

  return <div className={styles.shell}>
    <header className={styles.cleanHeader}>
      <p className={styles.kicker}>CORE membership</p>
      <h1 id="membership-title">{accountMode && displayName ? `${displayName}'s membership` : "Support CORE and get beta access."}</h1>
      <p className={styles.heroCopy}>{accountMode ? "Manage your CORE membership and billing in one place." : "One membership unlocks the current CORE beta and helps keep the site running."}</p>
      {requestedFeature ? <FocusCallout feature={requestedFeature} /> : null}
      {accountMode ? <div className={styles.currentPlan} role="status" aria-live="polite"><span>Current plan</span><strong>{accountLoading ? "Checking…" : active ? "CORE Member" : "Free"}</strong><small>{account?.cancelAtPeriodEnd ? "Ends after this billing period" : active ? "Active" : "No membership yet"}</small></div> : <Link className={styles.primaryCta} href="/account/plan">{joinLabel} <ArrowRight aria-hidden="true" /></Link>}
    </header>

    <main className={styles.cleanMain}>
      <section className={styles.cleanGrid} aria-label="Membership details">
        <article className={`${styles.membershipCard} ${styles.cleanCard}`}>
          <p className={styles.planEyebrow}>One plan · cancel anytime</p><h2>{supportClosed ? "Support is currently closed" : "CORE Membership"}</h2>
          <div className={styles.priceLine}><strong>{supportClosed ? "—" : minimum ? `${minimum}+` : "Monthly"}</strong><span>{supportClosed ? "" : "per month"}</span></div>
          <p className={styles.planDescription}>Choose the amount that works for you. Every member gets the same beta access.</p>
          <div className={styles.amountSelector}>{accountMode ? <MembershipActions active={hasManagedSubscription} configured={configured} /> : <Link className={styles.primaryCta} href="/account/plan"><CreditCard aria-hidden="true" /> Continue to billing <ArrowRight aria-hidden="true" /></Link>}</div>
        </article>
        <aside className={styles.includedCard}><div className={styles.cleanCardIcon}><ShieldCheck aria-hidden="true" /></div><h2>Included with membership</h2><ul>{INCLUDED.map((item) => <li key={item}><Check aria-hidden="true" />{item}</li>)}</ul></aside>
      </section>
      <section className={styles.cleanNotice}><LockKeyhole aria-hidden="true" /><div><strong>Public content stays free.</strong><p>Your membership supports CORE development and personal account tools. It is not a subscription to any creator.</p></div></section>
      <section className={styles.cleanFaq} aria-labelledby="membership-faq"><div><p className={styles.kicker}>Need to know</p><h2 id="membership-faq">Simple billing, no surprises.</h2></div><div className={styles.cleanFaqList}><p><strong>Can I cancel?</strong> Yes. Cancel recurring billing from this page or through the secure billing portal.</p><p><strong>What does beta mean?</strong> CORE is still being built, so features may change as we improve them.</p></div></section>
    </main>
  </div>;
}

function FocusCallout({ feature }: { feature: { title: string; copy: string } }) { return <div className={styles.focusFeature} role="status"><LockKeyhole aria-hidden="true" /><span><small>Selected feature</small><strong>{feature.title}</strong></span><em>{feature.copy}</em></div>; }
