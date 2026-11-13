"use client";

import Link from "next/link";
import useSWR from "swr";
import { useCallback, useMemo, useState } from "react";
import { ArrowUpRight, Check, CheckCheck, ChevronDown, History, Play, Radio, Settings2 } from "lucide-react";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { WatchThumb } from "@/components/watch/WatchThumb";
import { youtubeIdFromHref } from "@/hooks/useWatchProgress";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import {
  CATCH_UP_CHANGED_EVENT,
  CATCH_UP_KIND_FILTER_LABEL,
  CATCH_UP_KIND_LABEL,
  catchUpSinceLabel,
  type CatchUpEntry,
  type CatchUpKind,
  type CatchUpResponse,
} from "@/lib/catch-up";
import type { SocialContentType } from "@/lib/social-alert";
import { itemToPlayable } from "@/lib/watch/playable";
import { cardThumbSource } from "@/lib/watch/thumbs";
import { cn } from "@/lib/utils";

const PREF_TYPES: Array<{ key: SocialContentType; label: string }> = [
  { key: "live", label: "Live & broadcasts" },
  { key: "video", label: "Videos & clips" },
  { key: "short", label: "Shorts & Reels" },
  { key: "photo", label: "Photos" },
  { key: "post", label: "Posts" },
];

const PREF_CREATORS = [{ slug: "core", label: "CORE" }, ...MEMBERS.map((member) => ({ slug: member.slug, label: member.stageName }))];

type AlertSettings = {
  enabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  rules: Array<{ memberSlug: string; contentType: SocialContentType; enabled: boolean }>;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

function announceChange() {
  window.dispatchEvent(new Event(CATCH_UP_CHANGED_EVENT));
}

function timeAgo(value: string, now: number): string {
  const minutes = Math.round((now - Date.parse(value)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function CatchUpCard({ entry, now, onOpen, onSeen }: {
  entry: CatchUpEntry;
  now: number;
  onOpen: (entry: CatchUpEntry) => void;
  onSeen?: (entry: CatchUpEntry) => void;
}) {
  const { item } = entry;
  const playable = itemToPlayable(item);
  const youtubeId = item.platform === "youtube" ? playable?.youtubeId ?? youtubeIdFromHref(item.href) : null;
  return (
    <article className="group relative flex min-w-0 flex-col gap-2">
      <button type="button" onClick={() => onOpen(entry)} className="flex min-w-0 flex-col gap-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--core)]">
        <span className="relative block aspect-video overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ring-secondary">
          <WatchThumb {...cardThumbSource(item, item.memberSlug ? MEMBERS_BY_SLUG[item.memberSlug]?.portrait : undefined, youtubeId)}
            focalPoint={item.focalPoint} className="size-full object-cover" sizes="(max-width: 640px) 50vw, 18rem" />
          <span className={cn("absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white",
            entry.kind === "live" ? "bg-[#e5172f]" : "bg-black/75")}>
            {CATCH_UP_KIND_LABEL[entry.kind]}
          </span>
          <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100" aria-hidden>
            {playable ? <Play className="size-4" fill="currentColor" /> : <ArrowUpRight className="size-4" />}
          </span>
        </span>
        <span className="min-w-0">
          <strong className="line-clamp-2 text-sm font-semibold leading-5 text-primary">{item.title}</strong>
          <span className="mt-0.5 block truncate text-xs text-tertiary">
            {item.memberSlug ? item.memberLabel : "CORE"} · {timeAgo(entry.at, now)}
          </span>
        </span>
      </button>
      {onSeen ? (
        <button type="button" onClick={() => onSeen(entry)} aria-label={`Mark “${item.title}” as seen`}
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-black/70 text-white opacity-100 transition hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
          <Check className="size-4" aria-hidden />
        </button>
      ) : null}
    </article>
  );
}

function CatchUpPreferences() {
  const { data, error, mutate } = useSWR<{ settings: AlertSettings }>("/api/account/social-notifications", getJson, { revalidateOnFocus: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const settings = data?.settings;
  const enabled = (member: string, type: SocialContentType) =>
    settings?.rules.find((rule) => rule.memberSlug === member && rule.contentType === type)?.enabled ?? true;

  async function toggle(member: string, type: SocialContentType) {
    if (!settings || saving) return;
    const value = !enabled(member, type);
    const rules = settings.rules.filter((rule) => !(rule.memberSlug === member && rule.contentType === type));
    // Default-on: only store an override when it differs from the default.
    const next = { ...settings, rules: value ? rules : [...rules, { memberSlug: member, contentType: type, enabled: false }] };
    setSaving(true);
    setMessage("");
    await mutate({ settings: next }, false);
    const response = await fetch("/api/account/social-notifications", {
      method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(next),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      await mutate();
      setMessage("Couldn’t save that change. Try again.");
      return;
    }
    await mutate();
    announceChange();
  }

  if (error) return <p className="text-sm text-tertiary">Your creator choices couldn’t be loaded.</p>;
  if (!settings) return <div className="h-40 animate-pulse rounded-xl bg-secondary" />;
  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Creators and content types included in Catch up and creator alerts</caption>
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-3 text-left text-xs font-semibold text-tertiary">Creator</th>
              {PREF_TYPES.map((type) => <th key={type.key} scope="col" className="px-1 py-2 text-center text-xs font-semibold text-tertiary">{type.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {PREF_CREATORS.map((creator) => (
              <tr key={creator.slug}>
                <th scope="row" className="border-t border-secondary py-1.5 pr-3 text-left font-medium text-primary">{creator.label}</th>
                {PREF_TYPES.map((type) => {
                  const on = enabled(creator.slug, type.key);
                  return (
                    <td key={type.key} className="border-t border-secondary px-1 py-1.5 text-center">
                      <button type="button" role="switch" aria-checked={on} disabled={saving}
                        aria-label={`${creator.label} ${type.label}`}
                        onClick={() => void toggle(creator.slug, type.key)}
                        className={cn("inline-grid size-9 place-items-center rounded-lg ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--core)] disabled:opacity-60",
                          on ? "bg-brand-solid text-white ring-transparent" : "bg-primary text-quaternary ring-secondary hover:text-primary")}>
                        {on ? <Check className="size-4" aria-hidden /> : <span className="size-1.5 rounded-full bg-current" aria-hidden />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-5 text-tertiary" role="status">
        {message || "These are the same choices as your creator alerts, so turning one off here also mutes that alert."}
      </p>
    </div>
  );
}

export function CatchUpPage() {
  const player = usePlayer();
  const { data, error, isLoading, mutate } = useSWR<CatchUpResponse>("/api/account/catch-up", getJson, {
    revalidateOnFocus: true,
    refreshInterval: 5 * 60_000,
  });
  const [creator, setCreator] = useState<string>("all");
  const [kind, setKind] = useState<"all" | CatchUpKind>("all");
  const [showPrefs, setShowPrefs] = useState(false);
  const now = data ? Date.parse(data.generatedAt) : 0;

  const scoped = useMemo(() => (data?.entries ?? []).filter((entry) =>
    creator === "all" || (entry.item.memberSlug ?? "core") === creator), [creator, data?.entries]);
  const visible = useMemo(() => scoped.filter((entry) => kind === "all" || entry.kind === kind), [kind, scoped]);
  const kindCounts = useMemo(() => {
    const counts: Partial<Record<CatchUpKind, number>> = {};
    for (const entry of scoped) counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
    return counts;
  }, [scoped]);

  const markSeen = useCallback(async (keys: string[]) => {
    if (!data || !keys.length) return;
    const drop = new Set(keys);
    const entries = data.entries.filter((entry) => !drop.has(entry.key));
    await mutate({ ...data, entries, count: entries.length }, false);
    const response = await fetch("/api/account/catch-up", {
      method: "PATCH", credentials: "same-origin", keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_seen", keys: keys.slice(0, 200) }),
    }).catch(() => null);
    if (!response?.ok) await mutate();
    announceChange();
  }, [data, mutate]);

  const markAllSeen = useCallback(async () => {
    if (!data) return;
    if (creator !== "all" || kind !== "all") {
      await markSeen(visible.map((entry) => entry.key));
      return;
    }
    await mutate({ ...data, entries: [], count: 0, groups: [] }, false);
    const response = await fetch("/api/account/catch-up", {
      method: "PATCH", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_all_seen", through: data.generatedAt }),
    }).catch(() => null);
    await mutate();
    if (response?.ok) announceChange();
  }, [creator, data, kind, markSeen, mutate, visible]);

  const open = useCallback((entry: CatchUpEntry) => {
    const playable = itemToPlayable(entry.item);
    if (entry.kind !== "live") void markSeen([entry.key]);
    if (playable) {
      const queue = visible.map((candidate) => candidate.item).filter((item) => itemToPlayable(item));
      player.play(entry.item, queue);
      return;
    }
    const target = entry.item.sourceUrl ?? entry.item.href;
    if (/^https?:/i.test(target)) window.open(target, "_blank", "noopener,noreferrer");
    else window.location.assign(target);
  }, [markSeen, player, visible]);

  const live = [...(data?.entries.filter((entry) => entry.kind === "live") ?? []), ...(data?.liveEntries ?? [])];
  const missed = visible.filter((entry) => entry.kind !== "live");
  const filtered = creator !== "all" || kind !== "all";

  return (
    <div className="mx-auto min-h-[70vh] max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-primary text-brand-secondary ring-1 ring-inset ring-brand">
            <History className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-secondary">While you were away</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">Catch up</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-tertiary" aria-live="polite">
              {!data ? "Checking what’s new…"
                : data.count ? <><strong className="font-semibold text-primary">{data.count} new</strong> from {data.groups.length === 1 ? data.groups[0]!.label : `${data.groups.length} creators`} since {catchUpSinceLabel(data.since, now)}.</>
                  : <>You’re all caught up since {catchUpSinceLabel(data.since, now)}.</>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowPrefs((value) => !value)} aria-expanded={showPrefs} aria-controls="catch-up-preferences"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-secondary bg-primary px-3.5 text-sm font-semibold text-secondary transition hover:bg-primary_hover hover:text-primary">
            <Settings2 className="size-4" aria-hidden /> Creators & types
            <ChevronDown className={cn("size-4 transition", showPrefs && "rotate-180")} aria-hidden />
          </button>
          <button type="button" disabled={!visible.length} onClick={() => void markAllSeen()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-solid px-3.5 text-sm font-semibold text-white transition hover:bg-brand-solid_hover disabled:cursor-not-allowed disabled:opacity-45">
            <CheckCheck className="size-4" aria-hidden /> {filtered ? "Mark these seen" : "Mark all seen"}
          </button>
        </div>
      </div>

      {showPrefs ? (
        <section id="catch-up-preferences" className="mt-6 rounded-2xl bg-secondary p-4 ring-1 ring-inset ring-secondary sm:p-5">
          <h2 className="text-base font-semibold text-primary">What shows up here</h2>
          <p className="mb-3 mt-1 text-sm text-tertiary">Pick the creators and kinds of posts you want to catch up on.</p>
          <CatchUpPreferences />
        </section>
      ) : null}

      {data && !data.persistent ? (
        <p className="mt-5 rounded-xl bg-secondary px-4 py-3 text-sm text-tertiary ring-1 ring-inset ring-secondary" role="status">
          Catch up is showing the last 7 days. Marking items as seen isn’t available right now.
        </p>
      ) : null}

      {live.length ? (
        <section className="mt-8" aria-labelledby="catch-up-live">
          <h2 id="catch-up-live" className="flex items-center gap-2 text-lg font-semibold text-primary"><Radio className="size-4 text-[#e5172f]" aria-hidden /> Live now</h2>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
            {live.map((entry) => <CatchUpCard key={entry.key} entry={entry} now={now} onOpen={open} />)}
          </div>
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="catch-up-missed">
        <h2 id="catch-up-missed" className="text-lg font-semibold text-primary">What you missed</h2>
        {data?.groups.length ? (
          <div className="mt-3 grid gap-2">
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Creator">
              {[{ memberSlug: "all", label: "Everyone", count: data.count }, ...data.groups].map((group) => (
                <button key={group.memberSlug} type="button" role="radio" aria-checked={creator === group.memberSlug}
                  onClick={() => { setCreator(group.memberSlug); setKind("all"); }}
                  className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition",
                    creator === group.memberSlug ? "bg-brand-solid text-white ring-transparent" : "bg-primary text-secondary ring-secondary hover:text-primary")}>
                  {group.label} <span className="text-xs opacity-75">{group.count}</span>
                </button>
              ))}
            </div>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Type">
              {(["all", ...Object.keys(kindCounts)] as Array<"all" | CatchUpKind>).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)}
                  className={cn("inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition",
                    kind === value ? "bg-primary text-primary ring-brand" : "bg-transparent text-tertiary ring-secondary hover:text-primary")}>
                  {value === "all" ? "All types" : CATCH_UP_KIND_FILTER_LABEL[value]}
                  <span className="opacity-70">{value === "all" ? scoped.length : kindCounts[value]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-secondary px-5 py-10 text-center">
            <p className="text-sm font-semibold text-primary">Catch up is temporarily unavailable</p>
            <button type="button" onClick={() => void mutate()} className="mt-3 min-h-10 text-sm font-semibold text-brand-secondary">Try again</button>
          </div>
        ) : isLoading && !data ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
            {Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-video animate-pulse rounded-xl bg-secondary" />)}
          </div>
        ) : missed.length ? (
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
            {missed.map((entry) => <CatchUpCard key={entry.key} entry={entry} now={now} onOpen={open} onSeen={(seen) => void markSeen([seen.key])} />)}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-secondary px-5 py-12 text-center">
            <CheckCheck className="mx-auto size-7 text-quaternary" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-primary">Nothing new{filtered ? " here" : ""}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-tertiary">New videos, clips, shorts and broadcasts from the creators you follow will collect here until you’ve seen them.</p>
            <Link href="/watch" className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-brand-secondary">Browse Watch</Link>
          </div>
        )}
      </section>
    </div>
  );
}
