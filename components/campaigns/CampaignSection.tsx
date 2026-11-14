"use client";

import { useEffect, useId, useRef, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, ArrowRight, Scissors } from "lucide-react";
import { campaignIsInWindow, nextCampaignBoundary } from "@/lib/campaigns/schedule";
import type { CampaignFeed, CampaignPlacement, PublicCampaign } from "@/lib/campaigns/types";
import { CampaignCard } from "./CampaignCard";
import styles from "./CampaignSection.module.css";

type TimedFeed = CampaignFeed & { receivedAt: number };
async function fetchCampaigns(url: string): Promise<TimedFeed> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Campaigns unavailable");
  return { ...await response.json() as CampaignFeed, receivedAt: performance.now() };
}

/** Shared composition also used in the admin's unpublished preview. */
export function CampaignShowcase({ campaigns, preview = false }: { campaigns: PublicCampaign[]; preview?: boolean }) {
  const headingId = useId();
  const railId = useId();
  const rail = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState({ left: false, right: false });
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const update = () => setArrows({ left: element.scrollLeft > 2, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [campaigns.length]);
  if (!campaigns.length) return null;
  const move = (direction: number) => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.current?.scrollBy({ left: direction * (rail.current.clientWidth * .85), behavior: reducedMotion ? "instant" : "smooth" });
  };
  return <section className={styles.section} aria-labelledby={headingId}>
    <div className={styles.surface}>
      <div className={styles.intro}>
        <span className={styles.eyebrow}><Scissors size={15} aria-hidden="true" /> The clipping room</span>
        <h2 id={headingId}>Your clips.<br className={styles.mobileBreak} /> <span>Your coin.</span></h2>
        <p>Make the cut. Find a campaign. Make it count.</p>
        <div className={styles.introBottom}>
          <span className={styles.liveLabel}><i aria-hidden="true" />{preview ? "Campaign preview" : `${campaigns.length} ${campaigns.length === 1 ? "campaign" : "campaigns"} to explore`}</span>
          <div className={styles.arrows}>
            <button type="button" aria-label="Previous campaigns" aria-controls={railId} disabled={!arrows.left} onClick={() => move(-1)}><ArrowLeft size={18} /></button>
            <button type="button" aria-label="Next campaigns" aria-controls={railId} disabled={!arrows.right} onClick={() => move(1)}><ArrowRight size={18} /></button>
          </div>
        </div>
      </div>
      <div id={railId} ref={rail} className={styles.rail} tabIndex={0} role="region" aria-label="Clipping campaigns" data-lenis-prevent="true">
        {campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} preview={preview} />)}
      </div>
      <p className={styles.terms}>Campaigns run on Content Rewards. Eligibility, approval and payouts follow each organizer’s terms.</p>
    </div>
  </section>;
}

export function CampaignSection({ placement }: { placement: CampaignPlacement }) {
  const { data, error, mutate } = useSWR<TimedFeed>(`/api/campaigns?placement=${placement}`, fetchCampaigns, {
    refreshInterval: 60_000, revalidateOnFocus: true, refreshWhenHidden: false, shouldRetryOnError: false,
  });
  const [, tick] = useState(0);
  const now = data ? Date.parse(data.serverNow) + Math.max(0, performance.now() - data.receivedAt) : Date.now();
  useEffect(() => {
    if (!data) return;
    const boundary = nextCampaignBoundary(data.campaigns, now);
    const timeout = window.setTimeout(() => tick((value) => value + 1), Math.min(60_000, boundary === null ? 60_000 : Math.max(1, boundary - now)));
    const onVisibility = () => { if (document.visibilityState === "visible") { tick((value) => value + 1); void mutate(); } };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearTimeout(timeout); document.removeEventListener("visibilitychange", onVisibility); };
  }, [data, now, mutate]);
  const campaigns = !error && data ? data.campaigns.filter((campaign) => campaignIsInWindow(campaign, now)) : [];
  return <CampaignShowcase campaigns={campaigns} />;
}
