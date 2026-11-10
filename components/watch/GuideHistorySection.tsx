"use client";

import dynamic from "next/dynamic";
import { useState, type ComponentProps } from "react";
import type { GuideHistory as History } from "./GuideHistory";

const GuideHistory = dynamic(() => import("./GuideHistory").then((module) => module.GuideHistory), { ssr: false });
type HistoryPayload = ComponentProps<typeof History>;

/** The year-long heatmap and its data are optional work, outside the first screen. */
export function GuideHistorySection() {
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = async () => {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch("/api/watch/guide/history", { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("History unavailable");
      setData(await response.json() as HistoryPayload);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  };
  if (data) return <GuideHistory {...data} />;
  return <section className="mx-5 my-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-6 md:mx-10" aria-labelledby="guide-history-entry">
    <div><h2 id="guide-history-entry" className="text-lg font-semibold">Airtime history</h2><p className="mt-1 text-sm text-white/55">Broadcast history by creator.</p></div>
    <button type="button" onClick={() => void load()} disabled={loading} className="min-h-11 rounded-lg border border-white/20 px-4 text-sm font-medium text-white/80 transition-colors hover:border-white/40 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50">{loading ? "Loading history…" : failed ? "Try again" : "View history"}</button>
    {failed ? <p role="status" className="w-full text-sm text-white/60">History could not load. The guide is still available above.</p> : null}
  </section>;
}
