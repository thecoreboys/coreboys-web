"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  Cloud,
  Gauge,
  History,
  LayoutDashboard,
  LayoutPanelTop,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
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
    body: "Pick up on any device, build a private DVR, and get a calmer, more personal way to watch.",
    benefit: "Resume points · DVR folders · smart alerts",
  },
  guide: {
    eyebrow: "Guide alerts",
    title: "Set reminders for live channels.",
    body: "Save a channel, choose your quiet hours, and keep broadcasts in your DVR with private notes.",
    benefit: "Live reminders · quiet hours · private DVR",
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
    title: "Cloud DVR",
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
  {
    key: "together",
    title: "Watch together",
    detail: "Private rooms and shared queues",
    icon: UsersRound,
  },
  {
    key: "insights",
    title: "Viewing insights",
    detail: "Personal watch time, history, and streaks",
    icon: Gauge,
  },
  {
    key: "controls",
    title: "Player controls",
    detail: "Themes, shortcuts, and accessibility presets",
    icon: SlidersHorizontal,
  },
  {
    key: "badge",
    title: "Profile themes",
    detail: "Member colorways for your profile and player card",
    icon: BadgeCheck,
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
    <CtaSurface variant="member-vault" density={compact ? "compact" : "standard"} className={`p-3 text-white ${compact ? "" : "sm:p-4"} ${className}`} aria-label="CoreTV membership">
      <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-300/15"><LayoutPanelTop className="size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/42">{copy.eyebrow}</p>
          <h2 className={`mt-0.5 font-semibold tracking-[-0.025em] ${compact ? "text-sm" : "text-base"}`}>{copy.title}</h2>
          <p className={`mt-1 max-w-2xl leading-5 text-white/52 ${compact ? "text-[11px]" : "text-xs"}`}>{copy.body}</p>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-white/55"><Cloud className="size-3.5 text-rose-300" aria-hidden /> {copy.benefit}</p>
        </div>
        <Link href="/account/plan" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Become a Member <ArrowRight className="size-3.5" aria-hidden /></Link>
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
      <article className="member-hero member-hero--single relative isolate min-h-[24rem] overflow-hidden rounded-2xl bg-[#0b0a0f] p-5 text-white sm:aspect-[1933/814] sm:min-h-0 sm:p-7" aria-label="Support the site">
        <img src="/brand/supporter/supporter-vault-hero-v3.webp" alt="" aria-hidden decoding="async" fetchPriority="low" className="member-hero__generated-art absolute inset-0 -z-20 h-full w-full object-cover object-center" />
        <span aria-hidden className="member-hero__art-wash" />
        <span aria-hidden className="member-hero__perspective-grid" />
        <span aria-hidden className="member-hero__center-vignette" />
        <span aria-hidden className="member-hero__crt" />
        <span aria-hidden className="member-hero__inner-neon" />
        <span aria-hidden className="member-hero__edge-bloom" />
        <span aria-hidden className="member-hero__edge-flow" />
        <span aria-hidden className="member-hero__feature-particles">
          {Array.from({ length: 24 }, (_, index) => <i key={index} />)}
        </span>
        <div className="relative z-10 flex min-h-[20rem] flex-col items-center justify-center py-8 text-center sm:h-full sm:min-h-0">
          <div className="member-hero__offer flex max-w-[34rem] flex-col items-center">
            <p className="member-hero__price inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-[.14em]"><Sparkles className="size-3.5" aria-hidden /> {supportClosed ? "New recurring support closed" : minimum ? `Starting from ${minimum}/month` : "Choose your monthly support"}</p>
            <h2 className="member-hero__headline mt-5 text-white" aria-label="Support the site"><span aria-hidden data-text="SUPPORT">SUPPORT</span><span aria-hidden data-text="THE SITE">THE SITE</span></h2>
            <p className="member-hero__subhead mt-4 max-w-lg text-base leading-6">Help keep the website afloat. API usage fees, web hosting, databases, and development don&apos;t come free.</p>
            <Link href="/account/plan" className="member-hero__action mt-7 inline-flex min-h-12 items-center gap-2.5 rounded-xl px-5 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><span className="member-hero__action-label">Support the site</span><span className="rounded-md px-2 py-1 text-[11px]">{supportClosed ? "Closed" : minimum ? `${minimum}/month` : "Monthly"}</span><ArrowRight className="size-4" aria-hidden /></Link>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[.12em] text-white/60">Cancel anytime · Not affiliated with The Core Boys</p>
          </div>
          <div className="member-unlocks" aria-label="Everything included with membership">
            {DISCOVERY_FEATURES.map(({ key, title, detail, icon: Icon }) => (
              <article key={key} className={`member-unlock member-unlock--${key} relative flex items-center gap-3 overflow-hidden rounded-xl border p-3 text-left`}>
                <span aria-hidden className="member-unlock__shade" />
                <span aria-hidden className="member-unlock__flare" />
                <span aria-hidden className={`member-unlock__visual member-unlock__visual--${key}`}>
                  <Icon />
                  <i /><i /><i />
                </span>
                <span className="member-unlock__copy min-w-0">
                  <strong className="member-unlock__label flex items-center gap-2"><i aria-hidden />{title}</strong>
                  <span className="member-unlock__detail mt-1 block">{detail}</span>
                </span>
              </article>
            ))}
          </div>
        </div>
      </article>
    </section>
  );
}
