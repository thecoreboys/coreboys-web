"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { MEMBERS } from "@/lib/members";
import { useBrowseFilters } from "@/hooks/useBrowseFilters";
import { groupCrossposts } from "@/lib/watch/presentation";
import type { WatchItem } from "@/lib/watch/types";
import { PosterCard } from "./PosterCard";

export function ArchiveSearch() {
  const { filters, update, ready } = useBrowseFilters({ q: "", member: "", platform: "", contentType: "", dateFrom: "", dateTo: "" });
  const [query, setQuery] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setQuery(filters.q), 300); return () => window.clearTimeout(timer); }, [filters.q]);
  const params = new URLSearchParams({ ...filters, q: query, limit: "60", mode: "basic" });
  const { data, error, isLoading, isValidating, mutate } = useSWR<{ results: Array<{ item: WatchItem }>; total: number }>(ready && query === filters.q ? `/api/watch/search?${params}` : null, async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Search could not be loaded");
    return response.json();
  }, { revalidateOnFocus: false, keepPreviousData: true });
  const items = useMemo(() => groupCrossposts(data?.results.map((hit) => hit.item) ?? []), [data]);
  const selectClass = "min-h-11 rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 text-sm";
  return <>
    <label className="mt-8 grid gap-2 text-sm">Search<input type="search" className={`${selectClass} w-full`} value={filters.q} onChange={(event) => update({ q: event.target.value })} placeholder="Titles, creators, and descriptions" /></label>
    <div className="my-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="grid gap-2 text-sm">Creator<select className={selectClass} value={filters.member} onChange={(event) => update({ member: event.target.value })}><option value="">All creators</option><option value="house">CORE</option>{MEMBERS.map((member) => <option key={member.slug} value={member.slug}>{member.stageName}</option>)}</select></label>
      <label className="grid gap-2 text-sm">Platform<select className={selectClass} value={filters.platform} onChange={(event) => update({ platform: event.target.value })}><option value="">All platforms</option>{["youtube", "twitch", "tiktok", "instagram", "x", "house"].map((platform) => <option key={platform} value={platform}>{({ youtube: "YouTube", twitch: "Twitch", tiktok: "TikTok", instagram: "Instagram", x: "X", house: "CORE" })[platform]}</option>)}</select></label>
      <label className="grid gap-2 text-sm">Type<select className={selectClass} value={filters.contentType} onChange={(event) => update({ contentType: event.target.value })}><option value="">All types</option>{[["live", "Live now"], ["broadcast", "Replays"], ["video", "Videos"], ["short", "Shorts & Reels"], ["clip", "Clips"], ["photo", "Photos"], ["post", "Posts"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-2 text-sm">From<input type="date" className={selectClass} value={filters.dateFrom} onChange={(event) => update({ dateFrom: event.target.value })} /></label>
      <label className="grid gap-2 text-sm">To<input type="date" className={selectClass} value={filters.dateTo} onChange={(event) => update({ dateTo: event.target.value })} /></label>
    </div>
    {error ? <p role="alert" className="py-8">Search could not be loaded. <button type="button" className="min-h-11 underline" onClick={() => void mutate()}>Try again</button></p> : isLoading || !ready ? <p className="py-8 text-secondary" role="status">Searching…</p> : <><p className="my-5 text-sm text-secondary" role="status">{isValidating ? "Updating results…" : items.length ? `Showing ${items.length} results${data && data.total > 60 ? ` from ${data.total} matches. Narrow your filters to find more.` : "."}` : "No matches. Try a different title or fewer filters."}</p><div className="watch-search-grid grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <PosterCard key={item.id} item={item} context={items} />)}</div></>}
  </>;
}
