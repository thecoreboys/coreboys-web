"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MEMBERS } from "@/lib/members";
import type { WatchItem } from "@/lib/watch/types";
import { groupCrossposts, watchTitle, watchFormatLabel } from "@/lib/watch/presentation";
import { itemToPlayable } from "@/lib/watch/playable";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { BrowserDateTime } from "@/components/ui/BrowserDateTime";
import { WatchThumb } from "./WatchThumb";

export function TimelineArchive({ items }: { items: WatchItem[] }) {
  const player = usePlayer();
  const [creator, setCreator] = useState("all");
  const [year, setYear] = useState("all");
  const [limit, setLimit] = useState(24);
  const years = [...new Set(items.map((item) => item.publishedAt!.slice(0, 4)))].sort().reverse();
  const filtered = useMemo(() => groupCrossposts(items).filter((item) =>
    (creator === "all" || (item.memberSlug ?? "core") === creator)
    && (year === "all" || item.publishedAt?.startsWith(year))), [items, creator, year]);
  return <>
    <div className="my-8 flex flex-wrap items-end gap-4">
      <label className="grid gap-2 text-sm">Creator<select className="min-h-11 rounded-lg border border-white/20 bg-[color:var(--bg)] px-3" value={creator} onChange={(event) => { setCreator(event.target.value); setLimit(24); }}><option value="all">All creators</option><option value="core">CORE</option>{MEMBERS.map((member) => <option key={member.slug} value={member.slug}>{member.stageName}</option>)}</select></label>
      <label className="grid gap-2 text-sm">Year<select className="min-h-11 rounded-lg border border-white/20 bg-[color:var(--bg)] px-3" value={year} onChange={(event) => { setYear(event.target.value); setLimit(24); }}><option value="all">All years</option>{years.map((value) => <option key={value}>{value}</option>)}</select></label>
      <p className="py-3 text-sm text-secondary" role="status">{filtered.length} posts</p>
    </div>
    {filtered.length ? <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{filtered.slice(0, limit).map((item) => {
      const playable = itemToPlayable(item);
      const source = item.sourceUrl ?? item.href;
      return <li key={item.id} className="overflow-hidden rounded-lg border border-white/15">
        <div className="aspect-video overflow-hidden bg-white/5"><WatchThumb src={item.poster} alt="" className="h-full w-full object-contain" /></div>
        <div className="space-y-3 p-4"><time dateTime={item.publishedAt} className="text-sm text-secondary"><BrowserDateTime value={item.publishedAt!} options={{ year: "numeric", month: "long", day: "numeric" }} fallback={item.publishedAt!.slice(0, 10)} /></time><h2 className="line-clamp-2 text-base font-semibold" title={item.title}>{watchTitle(item)}</h2><p className="text-sm text-secondary">{item.memberLabel} · {watchFormatLabel(item)} · {item.platform === "x" ? "X" : item.platform}</p><div className="flex flex-wrap gap-4">{playable ? <button type="button" className="min-h-11 font-semibold underline underline-offset-4" onClick={() => player.play(playable)}>Play</button> : null}<a className="min-h-11 py-3 text-sm underline underline-offset-4" href={source} target="_blank" rel="noopener noreferrer">{item.kind === "post" ? "Read post" : "Open original"} ↗</a></div></div>
      </li>;
    })}</ol> : <p className="py-10 text-secondary">No dated posts match these filters.</p>}
    {filtered.length > limit ? <button type="button" className="my-8 min-h-11 rounded-lg border border-white/20 px-5" onClick={() => setLimit((value) => value + 24)}>Show 24 more</button> : null}
    <p className="mt-8 text-sm text-secondary">Dates show when each source published its post. <Link href={{ pathname: "/search" }} className="underline">Search the full archive</Link> for older content.</p>
  </>;
}
