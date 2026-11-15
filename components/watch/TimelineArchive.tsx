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
import { FilterSelect } from "@/components/ui/FilterSelect";
import browse from "@/components/ui/BrowseControls.module.css";

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
    <div className={`${browse.panel} ${browse.timelineRow} my-8`} role="search" aria-label="Filter the timeline">
      <FilterSelect label="Creator" ariaLabel="Filter timeline by creator" value={creator} onChange={(value) => { setCreator(value); setLimit(24); }} options={[{ value: "all", label: "All creators" }, { value: "core", label: "CORE" }, ...MEMBERS.map((member) => ({ value: member.slug, label: member.stageName, avatarUrl: member.portrait }))]} />
      <FilterSelect label="Year" ariaLabel="Filter timeline by year" value={year} onChange={(value) => { setYear(value); setLimit(24); }} options={[{ value: "all", label: "All years" }, ...years.map((value) => ({ value, label: value }))]} />
      <p className={browse.resultCount} role="status">{filtered.length} posts</p>
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
