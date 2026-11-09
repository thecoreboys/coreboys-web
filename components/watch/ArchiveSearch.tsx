"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { MEMBERS } from "@/lib/members";
import { useBrowseFilters } from "@/hooks/useBrowseFilters";
import { groupCrossposts } from "@/lib/watch/presentation";
import type { WatchItem } from "@/lib/watch/types";
import { PosterCard } from "./PosterCard";
import { FilterSelect } from "@/components/ui/FilterSelect";
import browse from "@/components/ui/BrowseControls.module.css";

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
  return <>
    <div className={`${browse.panel} mt-8`} role="search" aria-label="Search the archive">
    <label className={browse.field}><span>Search</span><input type="search" value={filters.q} onChange={(event) => update({ q: event.target.value })} placeholder="Titles, creators, and descriptions" /></label>
    <div className={`${browse.archiveGrid} core-archive-filters`}>
      <FilterSelect label="Creator" ariaLabel="Filter archive by creator" value={filters.member} onChange={(value) => update({ member: value })} options={[{ value: "", label: "All creators" }, { value: "house", label: "CORE" }, ...MEMBERS.map((member) => ({ value: member.slug, label: member.stageName, avatarUrl: member.portrait }))]} />
      <FilterSelect label="Platform" ariaLabel="Filter archive by platform" value={filters.platform} onChange={(value) => update({ platform: value })} options={[{ value: "", label: "All platforms" }, ...["youtube", "twitch", "tiktok", "instagram", "x", "house"].map((value) => ({ value, label: ({ youtube: "YouTube", twitch: "Twitch", tiktok: "TikTok", instagram: "Instagram", x: "X", house: "CORE" })[value]! }))]} />
      <FilterSelect label="Type" ariaLabel="Filter archive by type" value={filters.contentType} onChange={(value) => update({ contentType: value })} options={[{ value: "", label: "All types" }, ...[["live", "Live now"], ["broadcast", "Replays"], ["video", "Videos"], ["short", "Shorts & Reels"], ["clip", "Clips"], ["photo", "Photos"], ["post", "Posts"]].map(([value, label]) => ({ value: value!, label: label! }))]} />
      <label className={browse.field}><span>From</span><input type="date" value={filters.dateFrom} onChange={(event) => update({ dateFrom: event.target.value })} /></label>
      <label className={browse.field}><span>To</span><input type="date" value={filters.dateTo} onChange={(event) => update({ dateTo: event.target.value })} /></label>
    </div>
    </div>
    {error ? <p role="alert" className="py-8">Search could not be loaded. <button type="button" className="min-h-11 underline" onClick={() => void mutate()}>Try again</button></p> : isLoading || !ready ? <p className="py-8 text-secondary" role="status">Searching…</p> : <><p className="my-5 text-sm text-secondary" role="status">{isValidating ? "Updating results…" : items.length ? `Showing ${items.length} results${data && data.total > 60 ? ` from ${data.total} matches. Narrow your filters to find more.` : "."}` : "No matches. Try a different title or fewer filters."}</p><div className="watch-search-grid grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <PosterCard key={item.id} item={item} context={items} />)}</div></>}
  </>;
}
