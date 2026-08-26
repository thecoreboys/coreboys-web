import Link from "next/link";
import { Check, ChevronRight, CreditCard, History, LockKeyhole, ShieldCheck, Tv2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AccountSubscriptionApiResponse } from "@/lib/subscriptions/api-contract";
import { MembershipActions } from "./MembershipActions";
import styles from "./PricingExperience.module.css";

type AccountPlanPreview = AccountSubscriptionApiResponse["account"];

const MEMBERSHIP_FEATURES = [
  "Cross-device watch history and resume points",
  "Cloud DVR lists, folders, private notes, and tags",
  "Quiet hours and advanced notification controls",
  "Multiview with saved layouts",
  "Private watch rooms and shared queues",
  "Personal watch-time insights and streaks",
  "Custom themes, keyboard/remote controls, and accessibility presets",
];

export function PricingExperience({ accountMode = false, displayName, account, accountLoading = false, accountUnavailable = false }: {
  accountMode?: boolean; displayName?: string; account?: AccountPlanPreview; accountLoading?: boolean; accountUnavailable?: boolean; focusFeature?: string;
}) {
  const active = account?.source === "subscription" && ["active", "trialing"].includes(account.status);
  const configured = Boolean(account?.billingConfigured && !accountUnavailable && account.storageState === "ready");
  return <div className={styles.shell}>
    <section className={styles.hero} aria-labelledby="membership-title"><div className={styles.ambient} aria-hidden="true"><span /><span /><span /></div><div className={styles.heroInner}>
      {accountMode ? <Link className={styles.backLink} href="/account">Account <ChevronRight aria-hidden="true" /> Membership</Link> : null}
      <p className={styles.kicker}>From $3 per month · cancel anytime</p><h1 id="membership-title">{accountMode && displayName ? `${displayName}, manage your membership.` : "Help keep CORE online."}</h1>
      <p className={styles.heroCopy}>Membership pays for hosting, storage, databases, and ongoing development. Public videos, live streams, shorts, photos, Watch, and Guide stay free.</p>
      {accountMode ? <div className={styles.currentPlan} role="status"><span>Current plan</span><strong>{accountLoading ? "Checking…" : active ? "Member" : "Free"}</strong><small>{account?.cancelAtPeriodEnd ? "Ends after the current billing period" : active ? "Active · thank you" : "No payment method on file"}</small></div> : <Link className={styles.textLink} href="/account/plan">Sign in to join <ChevronRight aria-hidden="true" /></Link>}
    </div></section>
    <main className={styles.main}>
      <section className={styles.notice} aria-labelledby="membership-notice"><LockKeyhole aria-hidden="true" /><div><h2 id="membership-notice">About this membership</h2><p>This supports the independent CORE website and its account tools. It is not a creator subscription and does not pay any featured creator unless the site says so explicitly.</p></div></section>
      <section className={styles.planSection} aria-labelledby="supporter-title"><div className={styles.sectionHeading}><div><p className={styles.kicker}>CORE membership</p><h2 id="supporter-title">Everything included for $3+ a month.</h2></div><p>Choose any monthly amount from $3. Change or cancel it from your billing page.</p></div>
        <article className={`${styles.planCard} ${styles.planCardFeatured} ${styles.membershipCard}`}><h3>Membership features</h3><div className={styles.priceLine}><strong>$3+</strong><span>per month</span></div><p className={styles.planDescription}>One plan includes every personal account feature listed below.</p><ul>{MEMBERSHIP_FEATURES.map((feature) => <li key={feature}><span className={styles.check}><Check /></span>{feature}</li>)}</ul>{accountMode ? <MembershipActions active={active} configured={configured} /> : <Link className={styles.primaryCta} href="/account/plan"><CreditCard /> Sign in to join <ChevronRight /></Link>}</article>
      </section>
      <section className={styles.utilitySection} aria-labelledby="included-title"><div className={styles.utilityHeading}><div><p className={styles.kicker}>The basics</p><h2 id="included-title">What stays free.</h2></div></div><div className={styles.valueGrid}><Value icon={Tv2} title="All public content" copy="Watch public videos, broadcasts, shorts, photos, Watch, and Guide without paying." /><Value icon={History} title="A free account" copy="Sign in for basic watch history and account settings. Membership adds the advanced tools above." /><Value icon={ShieldCheck} title="Billing you control" copy="Stripe shows the recurring amount before checkout and lets you update or cancel it later." /></div></section>
      {accountMode ? <section className={styles.finalNotice}><div><p className={styles.kicker}>Billing</p><h2>Cancel whenever you want.</h2><p>You keep membership features through the paid period. Your account and public content remain available after it ends.</p></div></section> : null}
    </main>
  </div>;
}

function Value({ icon: Icon, title, copy }: { icon: LucideIcon; title: string; copy: string }) { return <article><span className={styles.valueIcon}><Icon /></span><h3>{title}</h3><p>{copy}</p></article>; }
