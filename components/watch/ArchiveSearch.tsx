"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { MEMBERS } from "@/lib/members";
import { useBrowseFilters } from "@/hooks/useBrowseFilters";
import { archiveMentionAt, removeArchiveMention } from "@/lib/watch/archive-mentions";
import { groupCrossposts } from "@/lib/watch/presentation";
import type { WatchItem } from "@/lib/watch/types";
import { CoreWordmark } from "@/components/brand/CoreWordmark";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { PosterCard } from "./PosterCard";
import { FilterSelect } from "@/components/ui/FilterSelect";
import browse from "@/components/ui/BrowseControls.module.css";
import styles from "./ArchiveSearch.module.css";

const PAGE_SIZE = 18;
const PLATFORMS = [
  ["youtube", "YouTube"], ["twitch", "Twitch"], ["tiktok", "TikTok"],
  ["instagram", "Instagram"], ["x", "X"],
] as const;
const CREATOR_OPTIONS = [
  { slug: "house", label: "CORE", portrait: "/brand/logo-core-white.png", handle: "core", aliases: ["core", "thecoreboys"] },
  ...MEMBERS.map((member) => ({
    slug: member.slug, label: member.stageName, portrait: member.portrait, handle: member.twitchLogin,
    aliases: [member.stageName, member.name, member.slug, member.alias, member.nickname, member.twitchLogin, member.comm.name].filter((value): value is string => Boolean(value)),
  })),
];

type ArchiveResponse = { results: Array<{ item: WatchItem }>; total: number; nextOffset: number | null };

export function ArchiveSearch() {
  const { filters, update, ready } = useBrowseFilters({ q: "", member: "", platform: "", contentType: "", dateFrom: "", dateTo: "", page: "" });
  const [query, setQuery] = useState("");
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `archive-mentions-${useId().replace(/[^a-z0-9_-]/gi, "")}`;
  const pageNumber = Math.max(0, Math.min(5_555, Number.parseInt(filters.page, 10) || 0));
  const offset = pageNumber * PAGE_SIZE;

  useEffect(() => { const timer = window.setTimeout(() => setQuery(filters.q), 300); return () => window.clearTimeout(timer); }, [filters.q]);
  const mention = focused && !dismissed ? archiveMentionAt(filters.q, caret) : null;
  const suggestions = useMemo(() => mention ? CREATOR_OPTIONS.filter((creator) => creator.aliases.some((alias) => alias.toLowerCase().replace(/[^a-z0-9._-]/g, "").includes(mention.query))).slice(0, 7) : [], [mention?.query]);
  const activeMentionIndex = Math.min(mentionIndex, Math.max(0, suggestions.length - 1));

  const params = new URLSearchParams({ ...filters, q: query, limit: String(PAGE_SIZE), offset: String(offset), mode: "basic" });
  params.delete("page");
  const { data, error, isLoading, isValidating, mutate } = useSWR<ArchiveResponse>(ready && query === filters.q ? `/api/watch/search?${params}` : null, async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Search could not be loaded");
    return response.json();
  }, { revalidateOnFocus: false });
  const items = useMemo(() => groupCrossposts(data?.results.map((hit) => hit.item) ?? []), [data]);

  function chooseCreator(creator: typeof CREATOR_OPTIONS[number]) {
    if (!mention) return;
    const next = removeArchiveMention(filters.q, mention);
    update({ q: next, member: creator.slug, page: "" });
    setCaret(next.length);
    setDismissed(true);
    inputRef.current?.focus();
  }

  function goToPage(page: number) {
    update({ page: page <= 0 ? "" : String(page) });
    inputRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }

  return <>
    <div className={`${browse.panel} mt-8`} role="search" aria-label="Search the archive">
      <label className={`${browse.field} ${styles.searchLabel}`} htmlFor={`${listId}-input`}><span>Search</span></label>
      <div className={`${browse.field} ${styles.queryWrap}`}>
        <input id={`${listId}-input`} ref={inputRef} type="search" role="combobox" aria-autocomplete="list" aria-expanded={Boolean(mention && suggestions.length)} aria-controls={mention && suggestions.length ? listId : undefined} aria-activedescendant={mention && suggestions.length ? `${listId}-${activeMentionIndex}` : undefined} value={filters.q}
          onChange={(event) => { setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length); setMentionIndex(0); setDismissed(false); update({ q: event.currentTarget.value, page: "" }); }}
          onFocus={(event) => { setFocused(true); setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length); }}
          onSelect={(event) => { setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length); }}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (!mention || !suggestions.length) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setMentionIndex((activeMentionIndex + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); }
            else if (event.key === "Enter") { event.preventDefault(); chooseCreator(suggestions[activeMentionIndex]!); }
            else if (event.key === "Escape") { event.preventDefault(); setDismissed(true); }
          }}
          placeholder="Search titles or type @ to choose a creator" />
        {mention && suggestions.length ? <div className={styles.suggestions} id={listId} role="listbox" aria-label="Choose a creator">
          {suggestions.map((creator, index) => <div key={creator.slug} id={`${listId}-${index}`} role="option" aria-selected={index === activeMentionIndex} data-active={index === activeMentionIndex} className={styles.suggestion}
            onMouseEnter={() => setMentionIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseCreator(creator)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={creator.portrait} alt="" loading="lazy" />
            <span><strong>{creator.label}</strong><small>@{creator.handle}</small></span>
          </div>)}
        </div> : null}
      </div>
      <div className={`${browse.archiveGrid} core-archive-filters`}>
        <FilterSelect label="Creator" ariaLabel="Filter archive by creator" value={filters.member} onChange={(value) => update({ member: value, page: "" })} options={[{ value: "", label: "All creators" }, { value: "house", label: "CORE" }, ...MEMBERS.map((member) => ({ value: member.slug, label: member.stageName, avatarUrl: member.portrait }))]} />
        <FilterSelect label="Platform" ariaLabel="Filter archive by platform" value={filters.platform} onChange={(value) => update({ platform: value, page: "" })} options={[{ value: "", label: "All platforms" }, ...PLATFORMS.map(([value, label]) => ({ value, label, icon: <span aria-hidden="true"><SocialIcon platform={value} size={16} /></span> })), { value: "house", label: "CORE", icon: <span aria-hidden="true"><CoreWordmark /></span> }]} />
        <FilterSelect label="Type" ariaLabel="Filter archive by type" value={filters.contentType} onChange={(value) => update({ contentType: value, page: "" })} options={[{ value: "", label: "All types" }, ...[["live", "Live now"], ["broadcast", "Replays"], ["video", "Videos"], ["short", "Shorts & Reels"], ["clip", "Clips"], ["photo", "Photos"], ["post", "Posts"]].map(([value, label]) => ({ value: value!, label: label! }))]} />
        <label className={browse.field}><span>From</span><input type="date" value={filters.dateFrom} onChange={(event) => update({ dateFrom: event.target.value, page: "" })} /></label>
        <label className={browse.field}><span>To</span><input type="date" value={filters.dateTo} onChange={(event) => update({ dateTo: event.target.value, page: "" })} /></label>
      </div>
    </div>
    {error ? <p role="alert" className="py-8">Search could not be loaded. <button type="button" className="min-h-11 underline" onClick={() => void mutate()}>Try again</button></p> : isLoading || !ready || query !== filters.q ? <p className="py-8 text-secondary" role="status">Searching…</p> : <>
      <p className="my-5 text-sm text-secondary" role="status">{isValidating ? "Updating results…" : items.length ? `${items.length} results · ${data?.total.toLocaleString() ?? 0} matches` : "No matches. Try a different title or fewer filters."}</p>
      <div className="watch-search-grid grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <PosterCard key={`${item.platform}:${item.id}`} item={item} context={items} />)}</div>
      {data && (pageNumber > 0 || data.nextOffset !== null) ? <nav className={styles.pagination} aria-label="Search result pages">
        <button type="button" disabled={pageNumber === 0 || isValidating} onClick={() => goToPage(pageNumber - 1)}>Previous</button>
        <span>Page {pageNumber + 1} of {Math.max(1, Math.ceil(data.total / PAGE_SIZE)).toLocaleString()}</span>
        <button type="button" disabled={data.nextOffset === null || isValidating} onClick={() => goToPage(pageNumber + 1)}>Next</button>
      </nav> : null}
    </>}
  </>;
}
