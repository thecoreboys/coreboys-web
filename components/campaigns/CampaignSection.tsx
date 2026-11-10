"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import useSWR from "swr";
import { ArrowRight } from "lucide-react";
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
  const cycle = useRef<HTMLDivElement>(null);
  const [loop, setLoop] = useState({ copies: 1, seconds: 40 });
  const [manual, setManual] = useState(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const element = rail.current;
    const firstCycle = cycle.current;
    if (!element || !firstCycle) return;
    const animated = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    const update = () => {
      if (animated.matches && element.dataset.manual !== "true") element.scrollLeft = 0;
      const width = firstCycle.getBoundingClientRect().width;
      if (!width) return;
      const copies = Math.max(1, Math.ceil(element.clientWidth / width));
      const seconds = Math.max(20, width * copies / 38);
      setLoop((previous) => previous.copies === copies && Math.abs(previous.seconds - seconds) < .1 ? previous : { copies, seconds });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(firstCycle);
    const visibility = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)));
    visibility.observe(element);
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    animated.addEventListener("change", update);
    onVisibility();
    update();
    return () => { observer.disconnect(); visibility.disconnect(); document.removeEventListener("visibilitychange", onVisibility); animated.removeEventListener("change", update); };
  }, [campaigns.length]);
  useEffect(() => { if (!manual && rail.current) rail.current.scrollLeft = 0; }, [manual]);
  if (!campaigns.length) return null;
  return <section className={`watch-campaign-section ${styles.section}`} aria-labelledby={headingId}>
    <div className={styles.surface}>
      <div className={styles.intro}>
        <img className={styles.illustration} src="/brand/campaign-clips-coins-v1.webp" alt="" width={600} height={400} loading="lazy" decoding="async" />
        <h2 id={headingId}><span className={styles.headline}>Your clips.<br /> Your coin.</span></h2>
        <div className={styles.introDetail}>
          <p>Find a campaign. Make your clip.<br />Submit it to the organizer.</p>
        </div>
        <div className={styles.actions}>
          <a href="https://contentrewards.com/c/discover" target="_blank" rel="noopener noreferrer" className={styles.explore}>Explore campaigns <ArrowRight size={18} aria-hidden /></a>
        </div>
        <p className={styles.terms}>Campaigns run on Content Rewards. Eligibility, approval and payouts follow each organizer’s terms.</p>
      </div>
      <div id={railId} ref={rail} className={styles.rail} tabIndex={0} role="region" aria-label="Clipping campaigns" data-lenis-prevent="true" data-running={inView && pageVisible && !manual} data-manual={manual} style={{ "--campaign-duration": `${loop.seconds}s` } as CSSProperties}
        onFocusCapture={(event) => { if (event.target.matches(":focus-visible")) setManual(true); }}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setManual(false); }}>
        <div className={styles.track}>
          {[0, 1].map((group) => <div className={styles.loopGroup} key={group} aria-hidden={group === 1 ? true : undefined}>
            {Array.from({ length: loop.copies }, (_, copy) => <div key={copy} ref={group === 0 && copy === 0 ? cycle : undefined} className={styles.cycle} data-duplicate={group === 1 || copy > 0 ? "true" : undefined} aria-hidden={group === 1 || copy > 0 ? true : undefined}>
              {campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} preview={preview} duplicate={group === 1 || copy > 0} />)}
            </div>)}
          </div>)}
        </div>
      </div>
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
