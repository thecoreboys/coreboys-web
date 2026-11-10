"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import type { GuideHistory as History } from "./GuideHistory";

const GuideHistory = dynamic(() => import("./GuideHistory").then((module) => module.GuideHistory), { ssr: false });
type HistoryPayload = ComponentProps<typeof History>;

/** The year-long heatmap and its data are optional work, outside the first screen. */
export function GuideHistorySection() {
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch("/api/watch/guide/history", { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("History unavailable");
      setData(await response.json() as HistoryPayload);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, [loading]);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || data || loading || failed) return;
    if (!("IntersectionObserver" in window)) { void load(); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); void load(); }
    }, { rootMargin: "800px 0px" });
    observer.observe(section);
    return () => observer.disconnect();
  }, [data, failed, loading, load]);
  if (data) return <GuideHistory {...data} />;
  return <section ref={sectionRef} className="guide-history-entry" aria-labelledby="guide-history-entry" aria-busy={loading}>
    <div><h2 id="guide-history-entry">Airtime history</h2><p>Broadcast history by creator.</p></div>
    {failed ? <button type="button" onClick={() => void load()}>Try again</button> : <div className="guide-history-skeleton" role="status"><span className="sr-only">Loading airtime history</span><i /><i /><i /><i /><i /><i /></div>}
    {failed ? <p role="status" className="guide-history-entry-error">History could not load. The guide is still available above.</p> : null}
  </section>;
}
