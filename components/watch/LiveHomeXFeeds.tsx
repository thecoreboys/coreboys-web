"use client";

import Link from "next/link";
import { Bell, Camera, RefreshCw, X } from "lucide-react";
import { useLiveXFeeds } from "@/hooks/useLiveXFeeds";
import type { WatchHomeXPost, WatchHomeXSpace } from "@/lib/watch/x-posts";
import { BrowserRelativeTime } from "@/components/ui/BrowserDateTime";
import { XTweetsRail } from "./XTweetsRail";
import styles from "./LiveHomeXFeeds.module.css";

export function LiveHomeXFeeds({ initialMembers, initialCrew, spaces }: {
  initialMembers: WatchHomeXPost[];
  initialCrew: WatchHomeXPost[];
  spaces: WatchHomeXSpace[];
}) {
  const { members, crew, feed, connection, newPosts, refresh, dismiss } = useLiveXFeeds(initialMembers, initialCrew);
  const audiences = (["members", "crew"] as const).filter((audience) => (
    audience === "members" ? members.length > 0 || spaces.length > 0 : crew.length > 0
  ));
  // Keep recovery running in the hook without advertising an empty or broken
  // feed on the home page. Each audience appears only when it has content.
  if (!audiences.length) return null;

  const fresh = connection === "connected" && feed?.status === "fresh";
  const saved = connection === "offline" || connection === "retrying" || feed?.status === "stale";
  const status = saved ? "Saved posts" : fresh ? "Updates automatically" : "Latest posts";

  return (
    <div className={styles.feeds}>
      {audiences.map((audience, index) => {
        const isCrew = audience === "crew";
        const items = isCrew ? crew : members;
        const title = isCrew ? "Behind the camera · Crew on X" : "CORE members on X";
        return (
          <section key={audience} id={isCrew ? "crew-on-x" : "members-on-x"} className={styles.section} aria-labelledby={`${audience}-x-title`}>
            <div className={styles.heading}>
              <div className={styles.headingCopy}>
                <h2 id={`${audience}-x-title`}>{title}</h2>
                <p>{isCrew ? "The people behind it all, in their own words." : "The latest from the boys and the official CORE account."}</p>
              </div>
              {index === 0 ? <>
                <div className={styles.actions} role="group" aria-label="X post updates">
                  <button type="button" onClick={refresh} aria-label="Check for new X posts" title="Check for new posts"><RefreshCw size={17} aria-hidden="true" /></button>
                  <Link href="/account/settings#notifications" aria-label="X post notification settings" title="Notification settings"><Bell size={17} aria-hidden="true" /></Link>
                </div>
                <div className={styles.status}>
                  <span className={styles.indicator} data-active={fresh} aria-hidden="true" />
                  {feed?.refreshedAt ? <>
                    <span className={styles.srOnly}>{status}. </span>
                    <span>Updated <BrowserRelativeTime value={feed.refreshedAt} /></span>
                  </> : <span>{status}</span>}
                </div>
              </> : null}
              {isCrew ? <Link href="/channels/core#crew"><Camera size={15} />Meet the crew</Link> : null}
            </div>
            <div aria-live="polite" aria-atomic="true">
              {newPosts[audience] > 0 ? <div className={styles.notice}>
                <span><Bell size={14} />{newPosts[audience]} new {isCrew ? "crew " : ""}{newPosts[audience] === 1 ? "post" : "posts"} added</span>
                <button type="button" onClick={() => dismiss(audience)} aria-label={`Dismiss new ${audience} posts notice`}><X size={15} /></button>
              </div> : null}
            </div>
            <XTweetsRail items={items} spaces={isCrew ? [] : spaces} title={title} maxItems={isCrew ? 24 : 18} showHeading={false} bounded />
          </section>
        );
      })}
    </div>
  );
}
