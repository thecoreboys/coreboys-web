"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, History, Radio } from "lucide-react";
import { useWatchProgress } from "@/hooks/useWatchProgress";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { bestWatchProgressMark, selectContinueWatchingItems } from "@/lib/watch/continue-watching";
import { homeItemReferences } from "@/lib/watch/home-catalog";
import { readableTitle } from "@/lib/watch/presentation";
import type { WatchItem } from "@/lib/watch/types";
import { WatchThumb } from "./WatchThumb";
import styles from "./GuideHistoryDeck.module.css";

type Tab = "watched" | "broadcasts";

/**
 * History in two views: what this viewer was watching (resume where they left
 * off) and the most recent broadcasts that aired. Pass the catalog items the
 * page already has; nothing extra is fetched. Drop it anywhere.
 */
export function WatchHistoryPanel({ items, broadcasts, limit = 6, headingId = "watch-history-panel-title" }: {
  /** Items to resolve the viewer's watch progress against. */
  items: readonly WatchItem[];
  /** Past broadcasts (VODs/replays), newest first or in any order. */
  broadcasts: readonly WatchItem[];
  limit?: number;
  headingId?: string;
}) {
  const { map, ready } = useWatchProgress();
  const player = usePlayer();
  const time = useBrowserTimeZone();
  const watched = useMemo(
    () => ready ? selectContinueWatchingItems(items, map, homeItemReferences, { limit }) : [],
    [items, limit, map, ready],
  );
  const recent = useMemo(() => [...broadcasts]
    .filter((item) => item.kind !== "live" && item.format !== "live")
    .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""))
    .slice(0, limit), [broadcasts, limit]);
  const [chosen, setChosen] = useState<Tab | null>(null);
  // Default to what the viewer was watching once their history has loaded.
  const tab: Tab = chosen ?? (watched.length ? "watched" : "broadcasts");
  const list = tab === "watched" ? watched : recent;
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => setNowMs(Date.now()), []);

  function when(item: WatchItem): string {
    const at = Date.parse(item.live?.startedAt ?? item.publishedAt ?? "");
    if (!Number.isFinite(at) || nowMs === null || !time.ready) return "";
    const days = Math.floor((nowMs - at) / 86_400_000);
    if (days < 1) return new Date(at).toLocaleTimeString(time.locale, { timeZone: time.timeZone, hour: "numeric", minute: "2-digit" });
    if (days < 7) return new Date(at).toLocaleDateString(time.locale, { timeZone: time.timeZone, weekday: "short" });
    return new Date(at).toLocaleDateString(time.locale, { timeZone: time.timeZone, month: "short", day: "numeric" });
  }

  function length(item: WatchItem): string {
    const seconds = item.durationSeconds ?? 0;
    if (seconds <= 0) return "";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  function progressOf(item: WatchItem): number {
    const mark = bestWatchProgressMark(homeItemReferences(item).map((reference) => map[reference]));
    if (mark?.progress) return Math.max(0, Math.min(1, mark.progress));
    if (mark?.seconds && item.durationSeconds) return Math.max(0, Math.min(1, mark.seconds / item.durationSeconds));
    return 0;
  }

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <header className={styles.panelHeader}>
        <div>
          <h2 id={headingId}>History</h2>
          <p>{tab === "watched" ? "Pick up where you left off." : "Recent broadcasts, ready to replay."}</p>
        </div>
        <Link href="/guide#guide-history-entry" prefetch={false} className={styles.panelLink}>Airtime<ArrowRight size={15} aria-hidden="true" /></Link>
      </header>
      <div className={styles.tabs} role="group" aria-label="History view">
        <button type="button" aria-pressed={tab === "watched"} onClick={() => setChosen("watched")}><History size={14} aria-hidden="true" />Watched{watched.length ? <span>{watched.length}</span> : null}</button>
        <button type="button" aria-pressed={tab === "broadcasts"} onClick={() => setChosen("broadcasts")}><Radio size={14} aria-hidden="true" />Broadcasts</button>
      </div>
      {list.length ? (
        <ol className={styles.historyList}>
          {list.map((item) => {
            const progress = tab === "watched" ? progressOf(item) : 0;
            const meta = [item.memberLabel, when(item), length(item)].filter(Boolean).join(" · ");
            return (
              <li key={`${item.platform}:${item.id}`}>
                <button type="button" className={styles.historyItem} onClick={() => player.play(item, list)} aria-label={`${tab === "watched" ? "Resume" : "Watch"} ${readableTitle(item.title)}`}>
                  <span className={styles.historyThumb}>
                    <WatchThumb src={item.poster || item.backdrop} alt="" />
                    {progress > 0 ? <span className={styles.progress} aria-hidden="true"><i style={{ width: `${progress * 100}%` }} /></span> : null}
                  </span>
                  <span className={styles.historyCopy}>
                    <strong>{readableTitle(item.title)}</strong>
                    <span>{meta}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.empty}>{tab === "watched"
          ? "Nothing in progress yet. Start something and it will wait for you here."
          : "No recent broadcasts yet."}</p>
      )}
    </section>
  );
}

/** The Guide strip and History side by side (stacked on phones). */
export function GuideAndHistory({ children }: { children: React.ReactNode }) {
  return <div className={styles.deck}>{children}</div>;
}
