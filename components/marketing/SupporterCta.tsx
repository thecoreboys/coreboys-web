"use client";

import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Cloud,
  History,
  LayoutDashboard,
  LayoutPanelTop,
} from "lucide-react";
import { CtaSurface } from "@/components/marketing/CtaSurface";
import { supporterPriceLabel, useSupporterBillingControls } from "@/hooks/useSupporterBillingControls";

type SupporterCtaProps = {
  placement?: "watch" | "guide" | "theater" | "multiview" | "network";
  compact?: boolean;
  className?: string;
};

const COPY = {
  watch: {
    eyebrow: "Make CoreTV yours",
    title: "Your watching, remembered.",
    body: "Resume across devices and organize saved videos into folders with private notes.",
    benefit: "Resume points · DVR folders · smart alerts",
  },
  guide: {
    eyebrow: "Guide alerts",
    title: "Set reminders for live channels.",
    body: "Save a channel, choose your quiet hours, and keep broadcasts in your DVR with private notes.",
    benefit: "Live reminders · quiet hours · DVR",
  },
  theater: {
    eyebrow: "Keep this in your orbit",
    title: "Turn one video into your own queue.",
    body: "Save what you want to revisit, add a private note, and continue exactly where you stopped.",
    benefit: "Cross-device resume · DVR notes · queues",
  },
  multiview: {
    eyebrow: "Saved multiviews",
    title: "Keep this layout for later.",
    body: "Membership adds reusable rooms, larger multiviews, and saved screen layouts.",
    benefit: "Saved rooms · more live tiles · private watch rooms",
  },
  network: {
    eyebrow: "Network tools",
    title: "Pin this network.",
    body: "Add its programs to your queue and return to the same watch position on another device.",
    benefit: "Pinned networks · personal queue · smart alerts",
  },
} as const;

const DISCOVERY_FEATURES = [
  {
    key: "dvr",
    title: "DVR",
    detail: "Lists, folders, private notes, and tags",
    icon: Cloud,
  },
  {
    key: "resume",
    title: "Cross-device resume",
    detail: "Your exact watch position, everywhere",
    icon: History,
  },
  {
    key: "alerts",
    title: "Smart alerts",
    detail: "Live notices with your own quiet hours",
    icon: BellRing,
  },
  {
    key: "rooms",
    title: "Saved rooms",
    detail: "Keep and restore multiview layouts",
    icon: LayoutDashboard,
  },
] as const;

/**
 * A product-native membership surface. It sells independent CoreTV software
 * features and operating support; it never implies creator
 * affiliation or access to creator-owned content.
 */
export function SupporterCta({ placement = "watch", compact = false, className = "" }: SupporterCtaProps) {
  const copy = COPY[placement];
  const controls = useSupporterBillingControls();
  if (placement === "watch" && !compact) {
    return <SupporterDiscoveryGrid className={className} controls={controls} />;
  }
  return (
    <CtaSurface variant="member-vault" density={compact ? "compact" : "standard"} className={`supporter-cta ${className}`} aria-label="CoreTV membership">
      <div className="supporter-cta__layout">
        <span className="supporter-cta__icon"><LayoutPanelTop aria-hidden /></span>
        <div className="supporter-cta__copy">
          <p className="supporter-cta__eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="supporter-cta__description">{copy.body}</p>
          {!compact ? <p className="supporter-cta__benefit">{copy.benefit}</p> : null}
        </div>
        <Link href="/upgrade" className="supporter-cta__action">Become a Member <ArrowRight aria-hidden /></Link>
      </div>
    </CtaSurface>
  );
}

function SupporterDiscoveryGrid({
  className,
  controls,
}: {
  className: string;
  controls: ReturnType<typeof useSupporterBillingControls>;
}) {
  const supportClosed = Boolean(controls?.renewalsDisabledAt);
  const minimum = controls ? supporterPriceLabel(controls.minimumAmountCents) : null;
  return (
    <section className={`supporter-discovery-grid ${className}`} aria-label="Support the site membership benefits">
      <article className="supporter-showcase" aria-label="Support the site">
        <span aria-hidden className="supporter-showcase__shade" />
        <div className="supporter-showcase__layout">
          <div className="supporter-showcase__offer">
            <p className="supporter-showcase__price">{supportClosed ? "New recurring support closed" : minimum ? `Starting from ${minimum}/month` : "Choose your monthly support"}</p>
            <h2>Support the site.</h2>
            <p className="supporter-showcase__description">Your support covers hosting, API access, and ongoing development. Make the site part of your daily watch.</p>
            <Link href="/upgrade" className="supporter-cta__action">{supportClosed ? "View membership details" : "Support the site"}<ArrowRight aria-hidden /></Link>
            <p className="supporter-showcase__notice">Cancel anytime · Not affiliated with The Core Boys</p>
          </div>
          <div className="supporter-showcase__benefits" aria-label="Membership highlights">
            {DISCOVERY_FEATURES.map(({ key, title, detail, icon: Icon }) => (
              <article key={key} className="supporter-showcase__benefit">
                <Icon aria-hidden />
                <h3>{title}</h3>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </article>
    </section>
  );
}
