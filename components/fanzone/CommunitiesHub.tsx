"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Heart,
  Lightbulb,
  LoaderCircle,
  MessageCircleQuestion,
  Play,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Trash2,
  Users,
} from "lucide-react";
import { cx } from "@/utils/cx";
import type { FanzoneCommunityKey } from "@/lib/fanzone-community-config";
import type {
  CommunityFeedItem,
  CommunityIdea,
  CommunityQuestion,
  FanzoneCommunitiesResponse,
} from "@/lib/fanzone-community-types";
import { XCommunityShelf } from "@/components/x/XCommunityShelf";
import { XPostNominationForm } from "@/components/x/XPostNominationForm";

const REMEMBERED_KEY = "coreboys:fanzone-community";
type View = "today" | "participate" | "calendar";
type FeedFilter = "all" | CommunityFeedItem["kind"];

export function CommunitiesHub() {
  const [data, setData] = useState<FanzoneCommunitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<View>("today");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");

  const load = useCallback(async (key?: FanzoneCommunityKey, quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const suffix = key ? `?community=${encodeURIComponent(key)}` : "";
      const response = await fetch(`/api/fanzone/communities${suffix}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Communities are temporarily unavailable.");
      setData((await response.json()) as FanzoneCommunitiesResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Communities are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const remembered = window.localStorage.getItem(REMEMBERED_KEY) as FanzoneCommunityKey | null;
    void load(remembered ?? undefined);
  }, [load]);

  const mutate = useCallback(async (key: string, payload: Record<string, unknown>, reload = true) => {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch("/api/fanzone/communities", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/fanzone%23communities";
        return false;
      }
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn’t save that change.");
      if (reload && data) await load(data.selected, true);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t save that change.");
      return false;
    } finally {
      setBusy(null);
    }
  }, [data, load]);

  async function selectCommunity(key: FanzoneCommunityKey) {
    window.localStorage.setItem(REMEMBERED_KEY, key);
    setFeedFilter("all");
    setLoading(true);
    await load(key, true);
    if (data?.viewer.signedIn) void mutate(`select-${key}`, { selectedKey: key }, false);
  }

  const orderedCommunities = useMemo(() => {
    if (!data) return [];
    const order = data.viewer.recommendedKeys;
    return [...data.communities].sort((a, b) => {
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
  }, [data]);

  if (loading && !data) return <CommunitiesSkeleton />;
  if (!data) {
    return (
      <div className="rounded-2xl border border-secondary bg-primary p-8 text-center">
        <CircleAlert className="mx-auto size-5 text-quaternary" />
        <p className="mt-3 text-sm font-semibold text-primary">{error ?? "Communities could not load."}</p>
        <button type="button" onClick={() => void load()} className={secondaryButtonClass}>Try again</button>
      </div>
    );
  }

  const selected = data.communities.find((community) => community.key === data.selected)!;
  const joined = data.viewer.joinedKeys.includes(data.selected);
  const favorite = data.viewer.favoriteKeys.includes(data.selected);
  const filteredFeed = feedFilter === "all"
    ? data.feed
    : data.feed.filter((item) => item.kind === feedFilter);

  return (
    <div className="space-y-6">
      {error ? (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-error_subtle bg-error-primary px-4 py-3 text-sm text-error-primary">
          <CircleAlert className="size-4 shrink-0" /> {error}
        </div>
      ) : null}

      <div className="-mx-6 overflow-x-auto px-6 pb-1 [scrollbar-width:none] md:-mx-8 md:px-8">
        <div className="flex min-w-max gap-2.5">
          {orderedCommunities.map((community) => {
            const active = community.key === data.selected;
            const isFavorite = data.viewer.favoriteKeys.includes(community.key);
            const isJoined = data.viewer.joinedKeys.includes(community.key);
            return (
              <button
                key={community.key}
                type="button"
                onClick={() => void selectCommunity(community.key)}
                aria-pressed={active}
                className={cx(
                  "group flex w-[178px] items-center gap-3 rounded-2xl border p-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  active
                    ? "border-brand bg-brand-primary shadow-sm"
                    : "border-secondary bg-primary hover:-translate-y-0.5 hover:border-brand/40",
                )}
              >
                <CommunityLogo src={community.logoUrl} name={community.name} accent={community.accent} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                    {community.name}
                    {isFavorite ? <Heart className="size-3 fill-current text-brand-secondary" aria-label="Favorite" /> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-quaternary">
                    {community.currentActivity || (isJoined ? "Joined" : community.ownerLabel)}
                  </span>
                </span>
                {active ? <ChevronRight className="size-4 text-brand-secondary" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-secondary bg-primary">
        <div className="relative p-5 md:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-20 blur-3xl"
            style={{ background: `radial-gradient(circle at 20% 0%, ${selected.accent}, transparent 70%)` }}
          />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <CommunityLogo src={selected.logoUrl} name={selected.name} accent={selected.accent} large />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-2xl font-semibold tracking-tight text-primary">{selected.name}</h3>
                  {joined ? <span className="rounded-full bg-success-primary px-2.5 py-1 text-xs font-semibold text-success-primary">Joined</span> : null}
                  {data.pulse.liveNow > 0 ? <span className="inline-flex items-center gap-1.5 rounded-full bg-error-primary px-2.5 py-1 text-xs font-semibold text-error-primary"><span className="size-1.5 animate-pulse rounded-full bg-error-solid" /> Live now</span> : null}
                </div>
                <p className="mt-2 max-w-[66ch] text-sm leading-relaxed text-tertiary">{selected.description}</p>
                <p className="mt-2 truncate text-xs text-quaternary">
                  {selected.currentActivity ? `Latest: ${selected.currentActivity}` : "No current activity posted."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void mutate("membership", { membership: { key: data.selected, joined: !joined } })}
                className={joined ? secondaryButtonClass : primaryButtonClass}
              >
                {joined ? <Check className="size-4" /> : <Users className="size-4" />}
                {joined ? "Joined" : "Join"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                aria-label={favorite ? `Remove ${selected.name} from favorites` : `Favorite ${selected.name}`}
                onClick={() => {
                  const next = favorite
                    ? data.viewer.favoriteKeys.filter((key) => key !== data.selected)
                    : [...data.viewer.favoriteKeys, data.selected];
                  void mutate("favorite", { favoriteKeys: next });
                }}
                className={iconButtonClass}
              >
                <Heart className={cx("size-4", favorite && "fill-current text-brand-secondary")} />
              </button>
              <a href={selected.officialXUrl} target="_blank" rel="noreferrer" className={secondaryButtonClass}>
                {selected.officialXHandle} <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-secondary sm:grid-cols-4">
          <PulseCell icon={Radio} value={data.pulse.liveNow} label="Live" />
          <PulseCell icon={Sparkles} value={data.pulse.newToday} label="New today" />
          <PulseCell icon={ThumbsUp} value={data.pulse.openPolls} label="Open votes" />
          <PulseCell icon={CalendarDays} value={data.pulse.upcoming} label="Upcoming" />
        </div>
      </section>

      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-secondary bg-secondary p-1">
        {([
          ["today", "Today", Sparkles],
          ["participate", "Participate", MessageCircleQuestion],
          ["calendar", "Calendar", CalendarDays],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setView(id)} className={cx(
            "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
            view === id ? "bg-primary text-primary shadow-sm" : "text-tertiary hover:text-primary",
          )}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
        <span className="ml-auto hidden pr-3 text-xs text-quaternary md:block">{selected.memberCount} site member{selected.memberCount === 1 ? "" : "s"}</span>
      </div>

      {view === "today" ? (
        <TodayView
          data={data}
          feed={filteredFeed}
          filter={feedFilter}
          onFilter={setFeedFilter}
          busy={busy}
          mutate={mutate}
        />
      ) : null}
      {view === "participate" ? (
        <ParticipateView data={data} busy={busy} onChanged={() => load(data.selected, true)} setBusy={setBusy} setError={setError} />
      ) : null}
      {view === "calendar" ? (
        <CalendarView data={data} busy={busy} mutate={mutate} />
      ) : null}
    </div>
  );
}

function TodayView({
  data,
  feed,
  filter,
  onFilter,
  busy,
  mutate,
}: {
  data: FanzoneCommunitiesResponse;
  feed: CommunityFeedItem[];
  filter: FeedFilter;
  onFilter: (filter: FeedFilter) => void;
  busy: string | null;
  mutate: (key: string, payload: Record<string, unknown>, reload?: boolean) => Promise<boolean>;
}) {
  const availableFilters = useMemo(() => {
    const kinds = new Set(data.feed.map((item) => item.kind));
    return (["all", "live", "official", "clip", "art", "poll", "showcase"] as FeedFilter[])
      .filter((item) => item === "all" || kinds.has(item as CommunityFeedItem["kind"]));
  }, [data.feed]);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <TodayPulseCard
          icon={Radio}
          label="Live now"
          item={data.feed.find((item) => item.kind === "live") ?? null}
          empty="Nobody in this community is live right now."
        />
        <TodayPulseCard
          icon={ThumbsUp}
          label="Open vote"
          item={data.feed.find((item) => item.kind === "poll") ?? null}
          empty="No community poll is open right now."
        />
        <TodayPulseCard
          icon={Sparkles}
          label="Staff showcase"
          item={data.feed.find((item) => item.kind === "showcase") ?? null}
          empty="Staff have not featured a new post yet."
        />
      </div>
      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-quaternary">Current pulse</p>
            <h4 className="mt-1 text-xl font-semibold tracking-tight text-primary">What is happening now</h4>
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {availableFilters.map((item) => (
              <button key={item} type="button" onClick={() => onFilter(item)} className={cx(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition",
                filter === item ? "bg-primary text-primary ring-1 ring-secondary" : "text-tertiary hover:text-primary",
              )}>{item === "all" ? "Everything" : item}</button>
            ))}
          </div>
        </div>
        {feed.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {feed.slice(0, 12).map((item) => <FeedCard key={item.id} item={item} />)}
          </div>
        ) : (
          <EmptyState icon={Sparkles} title="Nothing new in this filter" body="Choose Everything or check back after the next post." />
        )}
      </section>

      <CommunityXCard data={data} busy={busy} mutate={mutate} />

      <details className="group rounded-2xl border border-secondary bg-primary">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <Settings2 className="size-4 text-quaternary" />
          <span className="flex-1 text-sm font-semibold text-primary">Community preferences & privacy</span>
          <ChevronRight className="size-4 text-quaternary transition-transform group-open:rotate-90" />
        </summary>
        <div className="grid gap-3 border-t border-secondary p-4 md:grid-cols-3">
          <PreferenceToggle label="Live alerts" description="Email when this community goes live." checked={data.viewer.alerts.live} disabled={busy !== null || !data.viewer.signedIn} onChange={(value) => void mutate("alert-live", { alerts: { communityKey: data.selected, live: value } })} />
          <PreferenceToggle label="Official updates" description="Email for staff-published community updates." checked={data.viewer.alerts.updates} disabled={busy !== null || !data.viewer.signedIn} onChange={(value) => void mutate("alert-updates", { alerts: { communityKey: data.selected, updates: value } })} />
          <PreferenceToggle label="Weekly digest" description="One concise community recap each week." checked={data.viewer.alerts.weeklyDigest} disabled={busy !== null || !data.viewer.signedIn} onChange={(value) => void mutate("alert-digest", { alerts: { communityKey: data.selected, weeklyDigest: value } })} />
          <div className="md:col-span-3 flex flex-wrap items-center gap-3 rounded-xl bg-secondary p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary">Your FanZone community data</p>
              <p className="mt-1 text-xs text-tertiary">Export includes memberships, votes, questions, ideas, reports, and appeals. OAuth tokens are never included.</p>
            </div>
            {data.viewer.signedIn ? <a href="/api/account/export" className={secondaryButtonClass}>Download export</a> : <Link href="/login?next=/fanzone%23communities" className={primaryButtonClass}>Sign in</Link>}
            {data.viewer.signedIn ? <DeleteCommunityDataButton /> : null}
          </div>
        </div>
      </details>
    </div>
  );
}

function CommunityXCard({ data, busy, mutate }: {
  data: FanzoneCommunitiesResponse;
  busy: string | null;
  mutate: (key: string, payload: Record<string, unknown>, reload?: boolean) => Promise<boolean>;
}) {
  const x = data.viewer.x;
  return (
    <details className="group rounded-2xl border border-secondary bg-primary">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <span className="grid size-8 place-items-center rounded-lg bg-black text-sm font-bold text-white">𝕏</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-primary">X community</span>
          <span className="block truncate text-xs text-quaternary">
            {x.connected ? `Connected privately as @${x.username ?? "viewer"}` : "Official community links and selected posts"}
          </span>
        </span>
        <ChevronRight className="size-4 text-quaternary transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-4 border-t border-secondary p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-secondary p-4">
            <p className="text-sm font-semibold text-primary">Private connection status</p>
            <p className="mt-1 text-xs leading-relaxed text-tertiary">
              {x.connected
                ? `Your X account is connected. Official-profile follow: ${x.officialFollow.replace("_", " ")}. This status is only shown to you.`
                : "Connect X to privately sync whether you follow the official creator profile. CORE does not post as you."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {x.connected ? (
                <button type="button" className={secondaryButtonClass} onClick={() => void fetch("/api/account/sync", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "x" }) }).then(() => window.location.reload())}>Refresh X status</button>
              ) : (
                <Link href={data.viewer.signedIn ? "/api/oauth/x/start" : "/login?next=/account"} className={primaryButtonClass}>Connect X</Link>
              )}
              <Link href="/account#connections" className={secondaryButtonClass}>Manage</Link>
            </div>
          </div>
          <div className="rounded-xl bg-secondary p-4">
            <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-quaternary" /><p className="text-sm font-semibold text-primary">Unverified self-attestation</p></div>
            <p className="mt-1 text-xs leading-relaxed text-tertiary">X Community membership cannot be verified unless the exact Community and approved API access are configured. This optional claim is never presented as verified and can be revoked anytime.</p>
            <button
              type="button"
              disabled={busy !== null || !data.viewer.signedIn}
              onClick={() => void mutate("x-attestation", { xAttestation: { key: data.selected, attested: !x.communityAttested } })}
              className={cx("mt-3", x.communityAttested ? secondaryButtonClass : primaryButtonClass)}
            >
              {x.communityAttested ? <Check className="size-4" /> : null}
              {x.communityAttested ? "Self-attested · revoke" : "I joined on X"}
            </button>
          </div>
        </div>
        <div id={`x-community-${data.selected}`}>
          <XCommunityShelf selectedKey={data.selected} compact />
        </div>
        <details className="group rounded-xl border border-secondary bg-secondary">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            Nominate a public X post
            <ChevronRight className="size-4 text-quaternary transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-secondary p-4">
            <XPostNominationForm defaultCommunityKey={data.selected} compact />
          </div>
        </details>
      </div>
    </details>
  );
}

function ParticipateView({ data, busy, onChanged, setBusy, setError }: {
  data: FanzoneCommunitiesResponse;
  busy: string | null;
  onChanged: () => Promise<void> | void;
  setBusy: (value: string | null) => void;
  setError: (value: string | null) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <QuestionPanel data={data} busy={busy} onChanged={onChanged} setBusy={setBusy} setError={setError} />
      <IdeasPanel data={data} busy={busy} onChanged={onChanged} setBusy={setBusy} setError={setError} />
    </div>
  );
}

function QuestionPanel({ data, busy, onChanged, setBusy, setError }: PanelProps) {
  const [body, setBody] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy("question");
    try {
      const response = await fetch("/api/fanzone/communities/questions", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ communityKey: data.selected, body }) });
      if (response.status === 401) { window.location.href = "/login?next=/fanzone%23communities"; return; }
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn’t submit the question.");
      setBody("");
      await onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn’t submit the question."); }
    finally { setBusy(null); }
  }
  return (
    <section className="rounded-2xl border border-secondary bg-primary p-5">
      <div className="flex items-start gap-3"><MessageCircleQuestion className="mt-0.5 size-5 text-brand-secondary" /><div><h4 className="font-semibold text-primary">Ask the community</h4><p className="mt-1 text-xs leading-relaxed text-tertiary">Questions pass an automated safety screen, then stay visible only to you until staff approves them.</p></div></div>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} rows={3} placeholder={`Ask ${data.communities.find((item) => item.key === data.selected)?.name}…`} className={textareaClass} />
        <div className="flex items-center justify-between gap-3"><span className="text-xs text-quaternary">{body.length}/500</span><button type="submit" disabled={!body.trim() || busy !== null} className={primaryButtonClass}>{busy === "question" ? <LoaderCircle className="size-4 animate-spin" /> : null} Submit for review</button></div>
      </form>
      <div className="mt-5 space-y-3 border-t border-secondary pt-5">
        {data.questions.length ? data.questions.map((question) => <QuestionCard key={question.id} question={question} signedIn={data.viewer.signedIn} onChanged={onChanged} setError={setError} />) : <EmptyState icon={MessageCircleQuestion} title="No approved questions yet" body="Ask the first question." compact />}
      </div>
    </section>
  );
}

function IdeasPanel({ data, busy, onChanged, setBusy, setError }: PanelProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "content", title: "", problem: "", proposal: "" });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy("idea");
    try {
      const response = await fetch("/api/fanzone/communities/ideas", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ communityKey: data.selected, ...form }) });
      if (response.status === 401) { window.location.href = "/login?next=/fanzone%23communities"; return; }
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn’t submit the idea.");
      setForm({ category: "content", title: "", problem: "", proposal: "" }); setOpen(false); await onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn’t submit the idea."); }
    finally { setBusy(null); }
  }
  return (
    <section className="rounded-2xl border border-secondary bg-primary p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><Lightbulb className="mt-0.5 size-5 text-brand-secondary" /><div><h4 className="font-semibold text-primary">Ideas & voting</h4><p className="mt-1 text-xs leading-relaxed text-tertiary">Structured suggestions are reviewed before community voting opens.</p></div></div><button type="button" onClick={() => setOpen((value) => !value)} className={secondaryButtonClass}>{open ? "Close" : "New idea"}</button></div>
      {open ? <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl bg-secondary p-4">
        <div className="grid gap-3 sm:grid-cols-[140px_1fr]"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass}><option value="content">Content</option><option value="event">Event</option><option value="site">Site</option><option value="community">Community</option><option value="other">Other</option></select><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={100} placeholder="Short title" className={inputClass} /></div>
        <textarea value={form.problem} onChange={(event) => setForm({ ...form, problem: event.target.value })} maxLength={500} rows={2} placeholder="What could be better?" className={textareaClass} />
        <textarea value={form.proposal} onChange={(event) => setForm({ ...form, proposal: event.target.value })} maxLength={800} rows={3} placeholder="What do you propose?" className={textareaClass} />
        <div className="flex justify-end"><button type="submit" disabled={busy !== null || !form.title.trim() || !form.problem.trim() || !form.proposal.trim()} className={primaryButtonClass}>Submit for review</button></div>
      </form> : null}
      <div className="mt-5 space-y-3 border-t border-secondary pt-5">
        {data.ideas.length ? data.ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} signedIn={data.viewer.signedIn} onChanged={onChanged} setError={setError} />) : <EmptyState icon={Lightbulb} title="No approved ideas yet" body="A concise problem and proposal gives an idea the best chance." compact />}
      </div>
    </section>
  );
}

type PanelProps = { data: FanzoneCommunitiesResponse; busy: string | null; onChanged: () => Promise<void> | void; setBusy: (value: string | null) => void; setError: (value: string | null) => void };

function QuestionCard({ question, signedIn, onChanged, setError }: { question: CommunityQuestion; signedIn: boolean; onChanged: () => Promise<void> | void; setError: (value: string | null) => void }) {
  return <article className="rounded-xl bg-secondary p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium leading-relaxed text-primary">{question.body}</p><p className="mt-2 text-xs text-quaternary">{question.author} · {relativeTime(question.createdAt)}</p></div><StatusPill value={question.status} /></div>{question.answer ? <div className="mt-3 rounded-lg border-l-2 border-brand bg-primary p-3"><p className="text-xs font-semibold text-brand-secondary">Answered by CORE</p><p className="mt-1 text-sm leading-relaxed text-secondary">{question.answer}</p></div> : null}<ItemActions targetType="question" id={question.id} mine={question.mine} status={question.status} signedIn={signedIn} onChanged={onChanged} setError={setError} /></article>;
}

function IdeaCard({ idea, signedIn, onChanged, setError }: { idea: CommunityIdea; signedIn: boolean; onChanged: () => Promise<void> | void; setError: (value: string | null) => void }) {
  const publicIdea = idea.moderationState === "approved" && idea.status !== "removed";
  async function vote() {
    const response = await fetch(`/api/fanzone/communities/ideas/${idea.id}/vote`, { method: "POST", credentials: "same-origin" });
    if (response.status === 401) { window.location.href = "/login?next=/fanzone%23communities"; return; }
    const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error ?? "Couldn’t record that vote."); return; }
    await onChanged();
  }
  return <article className="rounded-xl bg-secondary p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-quaternary">{idea.category}</p><h5 className="mt-1 font-semibold text-primary">{idea.title}</h5></div><StatusPill value={idea.moderationState === "approved" ? idea.status : idea.moderationState} /></div><details className="mt-2 text-sm text-tertiary"><summary className="cursor-pointer text-xs font-semibold text-secondary">Read proposal</summary><p className="mt-2"><strong className="text-secondary">Problem:</strong> {idea.problem}</p><p className="mt-2"><strong className="text-secondary">Proposal:</strong> {idea.proposal}</p></details><div className="mt-3 flex items-center gap-2"><button type="button" disabled={!publicIdea} onClick={() => void vote()} className={cx("inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition", idea.voted ? "border-brand bg-brand-primary text-brand-secondary" : "border-secondary bg-primary text-secondary hover:border-brand", !publicIdea && "cursor-not-allowed opacity-50")}><ThumbsUp className={cx("size-3.5", idea.voted && "fill-current")} /> {idea.votes}</button><span className="text-xs text-quaternary">{idea.author} · {relativeTime(idea.createdAt)}</span></div><ItemActions targetType="idea" id={idea.id} mine={idea.mine} status={idea.moderationState === "approved" ? idea.status : idea.moderationState} signedIn={signedIn} onChanged={onChanged} setError={setError} /></article>;
}

function ItemActions({ targetType, id, mine, status, signedIn, onChanged, setError }: { targetType: "question" | "idea"; id: string; mine: boolean; status: string; signedIn: boolean; onChanged: () => Promise<void> | void; setError: (value: string | null) => void }) {
  const removable = mine && !["removed", "denied"].includes(status);
  const appealable = mine && ["removed", "denied"].includes(status);
  if (!signedIn || (!removable && !appealable && mine)) return null;
  async function remove() {
    if (!window.confirm("Remove this from FanZone? You can appeal a staff removal, but your own removal is immediate.")) return;
    const response = await fetch(`/api/fanzone/communities/${targetType === "question" ? "questions" : "ideas"}/${id}`, { method: "DELETE", credentials: "same-origin" });
    if (!response.ok) { const result = await response.json().catch(() => ({})) as { error?: string }; setError(result.error ?? "Couldn’t remove it."); return; } await onChanged();
  }
  async function report() {
    const details = window.prompt("Briefly describe the concern (privacy, copyright, safety, spam, or harassment)."); if (!details) return;
    const response = await fetch("/api/fanzone/communities/reports", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType, targetId: id, reason: "other", details }) });
    const result = await response.json().catch(() => ({})) as { error?: string }; setError(response.ok ? "Report received. Staff will review it." : result.error ?? "Couldn’t send the report.");
  }
  async function appeal() {
    const reason = window.prompt("Why should staff restore this item? (minimum 8 characters)"); if (!reason) return;
    const response = await fetch("/api/fanzone/communities/appeals", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType, targetId: id, reason }) });
    const result = await response.json().catch(() => ({})) as { error?: string }; setError(response.ok ? "Appeal submitted for staff review." : result.error ?? "Couldn’t submit the appeal.");
  }
  return <div className="mt-3 flex gap-3 border-t border-secondary pt-3">{removable ? <button type="button" onClick={() => void remove()} className="inline-flex items-center gap-1 text-xs font-semibold text-quaternary hover:text-error-primary"><Trash2 className="size-3" /> Remove</button> : null}{appealable ? <button type="button" onClick={() => void appeal()} className="text-xs font-semibold text-brand-secondary">Appeal</button> : null}{!mine ? <button type="button" onClick={() => void report()} className="text-xs font-semibold text-quaternary hover:text-secondary">Report</button> : null}</div>;
}

function CalendarView({ data, busy, mutate }: { data: FanzoneCommunitiesResponse; busy: string | null; mutate: (key: string, payload: Record<string, unknown>, reload?: boolean) => Promise<boolean> }) {
  const events = [...data.calendar].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]"><section className="rounded-2xl border border-secondary bg-primary p-5"><h4 className="text-lg font-semibold text-primary">Community calendar</h4><p className="mt-1 text-sm text-tertiary">Only staff-published dates appear here; no schedule is guessed.</p><div className="mt-5 space-y-3">{events.length ? events.map((event) => <a key={event.id} href={event.href ?? undefined} target={event.href ? "_blank" : undefined} rel={event.href ? "noreferrer" : undefined} className="flex gap-4 rounded-xl bg-secondary p-4 transition hover:bg-primary_hover"><time className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-center"><span className="text-[10px] font-semibold uppercase text-quaternary">{new Date(event.startsAt).toLocaleDateString(undefined, { month: "short" })}</span><span className="-mt-2 text-lg font-bold text-primary">{new Date(event.startsAt).getDate()}</span></time><span className="min-w-0"><span className="block font-semibold text-primary">{event.title}</span><span className="mt-1 block text-xs text-tertiary">{formatEventTime(event.startsAt, event.endsAt)}</span>{event.body ? <span className="mt-1 block text-sm text-tertiary">{event.body}</span> : null}</span></a>) : <EmptyState icon={CalendarDays} title="No dates posted" body="When staff confirms an event or stream, it will appear here." compact />}</div></section><section className="space-y-4"><div className="rounded-2xl border border-secondary bg-primary p-5"><Bell className="size-5 text-brand-secondary" /><h4 className="mt-3 font-semibold text-primary">Choose your signal</h4><p className="mt-1 text-sm leading-relaxed text-tertiary">Alerts are opt-in and scoped to your saved community preference.</p><div className="mt-4 space-y-3"><PreferenceToggle label="Live alerts" description="Email on live starts." checked={data.viewer.alerts.live} disabled={busy !== null || !data.viewer.signedIn} onChange={(value) => void mutate("calendar-live", { alerts: { communityKey: data.selected, live: value } })} /><PreferenceToggle label="Weekly digest" description="A single weekly recap." checked={data.viewer.alerts.weeklyDigest} disabled={busy !== null || !data.viewer.signedIn} onChange={(value) => void mutate("calendar-digest", { alerts: { communityKey: data.selected, weeklyDigest: value } })} /></div></div></section></div>;
}

function FeedCard({ item }: { item: CommunityFeedItem }) {
  const content = <><div className="relative aspect-video overflow-hidden bg-secondary">{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" /> : <div className="grid size-full place-items-center"><Play className="size-5 text-quaternary" /></div>}<span className={cx("absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white", item.kind === "live" ? "bg-error-solid" : "bg-black/70")}>{item.kind}</span></div><div className="p-4"><p className="text-xs font-semibold text-quaternary">{item.eyebrow}</p><h5 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-primary">{item.title}</h5><p className="mt-2 text-xs text-quaternary">{relativeTime(item.publishedAt)}</p></div></>;
  const className = "group overflow-hidden rounded-2xl border border-secondary bg-primary transition hover:-translate-y-0.5 hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
  return item.external ? <a href={item.href} target="_blank" rel="noreferrer" className={className}>{content}</a> : <a href={item.href} className={className}>{content}</a>;
}

function TodayPulseCard({ icon: Icon, label, item, empty }: { icon: typeof Radio; label: string; item: CommunityFeedItem | null; empty: string }) {
  const body = <><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-quaternary"><Icon className="size-4" /> {label}</div><p className={cx("mt-3 text-sm font-semibold leading-snug", item ? "text-primary" : "text-tertiary")}>{item?.title ?? empty}</p>{item ? <p className="mt-2 text-xs text-quaternary">{item.eyebrow} · {relativeTime(item.publishedAt)}</p> : null}</>;
  const className = "block min-h-32 rounded-2xl border border-secondary bg-primary p-4 transition";
  if (!item) return <div className={className}>{body}</div>;
  return item.external ? <a href={item.href} target="_blank" rel="noreferrer" className={`${className} hover:border-brand/40`}>{body}</a> : <a href={item.href} className={`${className} hover:border-brand/40`}>{body}</a>;
}

function PulseCell({ icon: Icon, value, label }: { icon: typeof Radio; value: number; label: string }) { return <div className="flex items-center gap-3 border-secondary p-4 even:border-l sm:border-l"><Icon className="size-4 text-quaternary" /><span><span className="block text-lg font-semibold tabular-nums text-primary">{value}</span><span className="block text-xs text-quaternary">{label}</span></span></div>; }
function CommunityLogo({ src, name, accent, large = false }: { src: string; name: string; accent: string; large?: boolean }) { return <span className={cx("grid shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-black", large ? "size-14" : "size-10")} style={{ boxShadow: `inset 0 0 0 1px ${accent}30` }}><img src={src} alt={`${name} logo`} className="size-full object-contain p-1" /></span>; }
function PreferenceToggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) { return <label className={cx("flex items-center gap-3 rounded-xl bg-secondary p-3", disabled && "opacity-60")}><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-primary">{label}</span><span className="block text-xs text-tertiary">{description}</span></span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[color:var(--color-brand-600)]" /></label>; }
function StatusPill({ value }: { value: string }) { const positive = ["answered", "approved", "planned", "shipped"].includes(value); const pending = ["pending", "under_review"].includes(value); return <span className={cx("shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold capitalize", positive ? "bg-success-primary text-success-primary" : pending ? "bg-warning-primary text-warning-primary" : "bg-primary text-quaternary")}>{value.replace("_", " ")}</span>; }
function EmptyState({ icon: Icon, title, body, compact = false }: { icon: typeof Sparkles; title: string; body: string; compact?: boolean }) { return <div className={cx("rounded-2xl border border-dashed border-secondary text-center", compact ? "p-6" : "mt-4 p-10")}><Icon className="mx-auto size-5 text-quaternary" /><p className="mt-2 text-sm font-semibold text-primary">{title}</p><p className="mt-1 text-xs text-tertiary">{body}</p></div>; }
function CommunitiesSkeleton() { return <div className="space-y-4"><div className="flex gap-3 overflow-hidden">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 w-44 shrink-0 animate-pulse rounded-2xl bg-primary ring-1 ring-secondary" />)}</div><div className="h-64 animate-pulse rounded-3xl bg-primary ring-1 ring-secondary" /></div>; }

function DeleteCommunityDataButton() { const [busy, setBusy] = useState(false); async function remove() { if (!window.confirm("Delete your FanZone memberships, preferences, questions, ideas, votes, reports, appeals, X self-attestations, and X post nominations? This cannot be undone.")) return; setBusy(true); const response = await fetch("/api/fanzone/communities", { method: "DELETE", credentials: "same-origin" }); if (response.ok) window.location.reload(); else setBusy(false); } return <button type="button" disabled={busy} onClick={() => void remove()} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-error-primary hover:bg-error-primary"><Trash2 className="size-4" /> {busy ? "Deleting…" : "Delete FanZone data"}</button>; }

function relativeTime(value: string) { const timestamp = Date.parse(value); if (!Number.isFinite(timestamp)) return "Recently"; const seconds = Math.round((Date.now() - timestamp) / 1000); if (seconds < 60) return "Just now"; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; const days = Math.floor(hours / 24); return days < 7 ? `${days}d ago` : new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function formatEventTime(start: string, end: string | null) { const startDate = new Date(start); const date = startDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); const time = startDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); if (!end) return `${date} · ${time}`; return `${date} · ${time}–${new Date(end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`; }

const primaryButtonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-solid px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-solid_hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass = "mt-0 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-secondary bg-primary px-3.5 text-sm font-semibold text-secondary transition hover:border-brand/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";
const iconButtonClass = "grid size-10 place-items-center rounded-xl border border-secondary bg-primary text-tertiary transition hover:border-brand/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";
const inputClass = "min-h-11 w-full rounded-xl border border-secondary bg-primary px-3 text-sm text-primary outline-none placeholder:text-placeholder focus:border-brand focus:ring-2 focus:ring-brand/20";
const textareaClass = `${inputClass} resize-y py-3`;
