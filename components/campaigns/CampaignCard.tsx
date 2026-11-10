"use client";

import { ArrowUpRight } from "lucide-react";
import SiteImage from "@/components/ui/SiteImage";
import { formatCampaignMoney, campaignWindow } from "@/lib/campaigns/schedule";
import type { CampaignInput, PublicCampaign } from "@/lib/campaigns/types";
import styles from "./CampaignSection.module.css";

const platformNames = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", x: "X" };
const formatDate = (value: string) => {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(date.getUTCFullYear() !== new Date().getUTCFullYear() ? { year: "numeric" as const } : {}), timeZone: "UTC" }).format(date);
};
const fullDate = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";

export function CampaignCard({ campaign, preview = false, duplicate = false }: { campaign: PublicCampaign | CampaignInput; preview?: boolean; duplicate?: boolean }) {
  const window = campaignWindow(campaign);
  const end = window ? new Date(window.end).toISOString() : campaign.campaignEndsAt;
  const isCampaignEnd = !!end && !!campaign.campaignEndsAt && Date.parse(end) === Date.parse(campaign.campaignEndsAt);
  const reward = campaign.rewardType === "cpm" && campaign.rateCents !== null ? formatCampaignMoney(campaign.rateCents) : formatCampaignMoney(campaign.budgetCents);
  const contents = <>
    <div className={styles.artwork}>
      <SiteImage src={campaign.imageUrl} alt={`${campaign.subject} campaign artwork`} fill sizes="(max-width: 389px) 78vw, (max-width: 900px) 19rem, (max-width: 1219px) 16rem, (max-width: 1523px) 21vw, 20rem" loading="lazy" decoding="async" />
    </div>
    <div className={styles.cardBody}>
      <div className={styles.cardTopline}>
        <span className={styles.subject}>{campaign.logoUrl ? <SiteImage src={campaign.logoUrl} alt="" width={22} height={22} /> : null}{campaign.subject}</span>
        <span className={styles.rewardType}>{campaign.rewardType === "cpm" ? "Per view" : "Reward pool"}</span>
      </div>
      <h3>{campaign.title}</h3>
      <div className={styles.reward}><strong>{reward}</strong><span>{campaign.rewardType === "cpm" ? "/ 1K approved views" : "shared pool"}</span></div>
      <p className={styles.platforms}>{campaign.platforms.map((platform) => platformNames[platform]).join(" · ")}</p>
      <div className={styles.cardFooter}>
        <div className={styles.dates}>
          {campaign.campaignStartsAt ? <span>Launched <time dateTime={campaign.campaignStartsAt} title={fullDate(campaign.campaignStartsAt)}>{formatDate(campaign.campaignStartsAt)}</time></span> : null}
          {end ? <span>{isCampaignEnd ? "Ends" : "Featured until"} <time dateTime={end} title={fullDate(end)}>{formatDate(end)}</time></span> : <span>Display dates not set</span>}
        </div>
        <span className={styles.openArrow} aria-hidden="true">View <ArrowUpRight size={16} /></span>
      </div>
      <span className={styles.cardCta}>View campaign <span aria-hidden="true">↗</span></span>
    </div>
  </>;
  return preview ? <article className={styles.card}>{contents}</article> : <a className={styles.card} href={campaign.campaignUrl} target="_blank" rel="noopener noreferrer" tabIndex={duplicate ? -1 : undefined} aria-label={`${campaign.title} — view campaign on Content Rewards (opens in your browser)`}>{contents}</a>;
}
