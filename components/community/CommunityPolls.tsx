"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart01, CheckCircle, Lock01 } from "@untitledui/icons";
import { Check, ChevronDown, ChevronUp, Clock3, Film, Share2 } from "lucide-react";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ProgressBar } from "@/components/base/progress-indicators/progress-indicators";
import { RadioButton, RadioGroup } from "@/components/base/radio-buttons/radio-buttons";
import { useAuth } from "@/components/providers/AuthProvider";
import { openAuthModal } from "@/lib/auth/modal";
import { cx } from "@/utils/cx";

type PollOption = {
  id: string;
  label: string;
  votes: number;
  weightedScore: number;
  mediaUrl: string | null;
  pct: number;
};

type Poll = {
  id: string;
  question: string;
  kind: "standard" | "caption" | "prediction" | "ranked" | "trivia" | "mvp";
  audience?: "everyone" | "signed_in" | "live_attendees" | "members";
  description: string | null;
  mediaUrl: string | null;
  sourceSubmissionId: string | null;
  winnerOptionId: string | null;
  status: "open" | "closed";
  opensAt: string | null;
  closesAt: string | null;
  createdAt: string;
  resultsVisibility: "always" | "after_vote" | "after_close";
  featured: boolean;
  options: PollOption[];
  totalVotes: number;
  weightedScore: number;
  myOptionId: string | null;
  myRanking: string[] | null;
};

export function CommunityPolls() {
  const { user, loading: authLoading } = useAuth();
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoadError(false);
    try {
      const response = await fetch("/api/community/polls", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { polls?: Poll[] };
      setPolls(data.polls ?? []);
    } catch {
      if (!quiet) {
        setPolls([]);
        setLoadError(true);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!polls?.some((poll) => poll.status === "open")) return;
    const timer = window.setInterval(() => void load(true), 10_000);
    return () => window.clearInterval(timer);
  }, [load, polls]);

  const ordered = useMemo(() => {
    if (!polls) return [];
    const requested = typeof window !== "undefined" ? new URL(window.location.href).searchParams.get("poll") : null;
    return [...polls].sort((a, b) => {
      if (a.id === requested) return -1;
      if (b.id === requested) return 1;
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [polls]);

  if (polls === null) return <div className="h-64 animate-pulse rounded-2xl bg-primary ring-1 ring-inset ring-secondary" />;
  if (loadError) {
    return (
      <div className="rounded-2xl border border-secondary bg-primary p-8 text-center">
        <p className="font-semibold text-primary">Couldn’t load polls</p>
        <p className="mt-1 text-sm text-tertiary">Try again in a moment.</p>
        <Button size="md" color="secondary" onClick={() => void load()} className="mt-4">Try again</Button>
      </div>
    );
  }
  if (ordered.length === 0) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-secondary bg-primary p-10 text-center">
        <FeaturedIcon icon={BarChart01} size="xl" color="gray" theme="modern" />
        <p className="mt-4 text-lg font-semibold text-primary">No polls right now</p>
        <p className="mt-1 max-w-[44ch] text-sm text-tertiary">The next question will appear here.</p>
      </div>
    );
  }

  const open = ordered.filter((poll) => poll.status === "open");
  const closed = ordered.filter((poll) => poll.status === "closed");
  const featured = open[0] ?? null;

  return (
    <div className="space-y-6">
      {featured ? <PollCard poll={featured} featured canVote={Boolean(user)} authLoading={authLoading} onVoted={() => load(true)} /> : (
        <div className="rounded-2xl border border-secondary bg-primary p-6 text-center"><Lock01 className="mx-auto size-5 text-quaternary" /><p className="mt-2 text-sm font-medium text-tertiary">Voting is quiet right now. Browse the recent results below.</p></div>
      )}

      {open.length > 1 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {open.slice(1).map((poll) => <PollCard key={poll.id} poll={poll} canVote={Boolean(user)} authLoading={authLoading} onVoted={() => load(true)} />)}
        </div>
      ) : null}

      {closed.length > 0 ? (
        <details className="group rounded-2xl border border-secondary bg-primary">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            Recent results <span className="text-xs font-medium text-quaternary">{closed.length}</span>
          </summary>
          <div className="grid gap-4 border-t border-secondary p-4 lg:grid-cols-2">
            {closed.map((poll) => <PollCard key={poll.id} poll={poll} canVote={false} authLoading={false} onVoted={() => load(true)} />)}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function PollCard({ poll, featured = false, canVote, authLoading, onVoted }: { poll: Poll; featured?: boolean; canVote: boolean; authLoading: boolean; onVoted: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [ranking, setRanking] = useState<string[]>(() => poll.options.map((option) => option.id));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const closed = poll.status === "closed";
  const hasVoted = poll.myOptionId !== null;
  const showResults =
    closed ||
    poll.resultsVisibility === "always" ||
    (poll.resultsVisibility === "after_vote" && hasVoted);

  useEffect(() => {
    setSelected(null);
  }, [poll.id]);

  async function submit() {
    if ((poll.kind !== "ranked" && !selected) || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/polls/${poll.id}/vote`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(poll.kind === "ranked" ? { ranking } : { optionId: selected }),
      });
      if (response.status === 401) {
        openAuthModal({ next: `${window.location.pathname}${window.location.search}` });
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error === "closed" ? "This poll just closed." : data.error ?? "Couldn’t record your vote.");
      onVoted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t record your vote.");
    } finally {
      setSubmitting(false);
    }
  }

  async function share() {
    const url = `${window.location.origin}/fanzone?poll=${poll.id}#polls`;
    if (navigator.share) {
      await navigator.share({ title: poll.question, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function moveRank(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= ranking.length) return;
    setRanking((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  return (
    <section id={`poll-${poll.id}`} className={cx("overflow-hidden rounded-2xl border border-secondary bg-primary", featured && "shadow-lg")}>
      <div className="border-b border-secondary p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge type="pill-color" color={closed ? "gray" : "success"} size="sm">{closed ? "Closed" : featured ? "Live poll" : "Open"}</Badge>
              {poll.kind !== "standard" ? (
                <Badge type="pill-color" color="brand" size="sm">
                  {poll.kind === "caption" ? "Caption contest" : poll.kind === "ranked" ? "Ranked choice" : poll.kind === "trivia" ? "Trivia" : poll.kind === "mvp" ? "MVP vote" : poll.kind === "prediction" ? "Prediction" : "Community poll"}
                </Badge>
              ) : null}
              {!closed && hasVoted ? <span className="inline-flex items-center gap-1 text-xs font-medium text-success-primary"><span className="size-1.5 rounded-full bg-success-solid" /> Results update live</span> : null}
            </div>
            <h3 className="mt-3 text-balance text-lg font-semibold tracking-tight text-primary">{poll.question}</h3>
            {poll.description ? <p className="mt-2 text-sm leading-relaxed text-tertiary">{poll.description}</p> : null}
            {poll.mediaUrl || poll.sourceSubmissionId ? (
              <PollHeroMedia
                url={poll.sourceSubmissionId
                  ? `/api/fanzone/photos/${poll.sourceSubmissionId}/image?size=thumb`
                  : poll.mediaUrl!}
              />
            ) : null}
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-quaternary">
              <span>{showResults ? `${poll.totalVotes} ${poll.totalVotes === 1 ? "person" : "people"}` : "One vote per account"}</span>
              {poll.closesAt && !closed ? <><span aria-hidden>·</span><span className="inline-flex items-center gap-1"><Clock3 size={12} /> {timeUntil(poll.closesAt)}</span></> : null}
            </p>
          </div>
          <button type="button" onClick={() => void share()} aria-label="Share poll" className="grid size-10 shrink-0 place-items-center rounded-xl border border-secondary bg-secondary text-tertiary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {copied ? <Check size={16} /> : <Share2 size={16} />}
          </button>
        </div>
      </div>

      <div className="p-5 md:p-6">
        {showResults ? <PollResults poll={poll} /> : hasVoted ? (
          <div className="rounded-xl border border-success_subtle bg-success-primary p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-success-primary"><CheckCircle className="size-4" /> Vote recorded</p>
            <p className="mt-1 text-xs text-tertiary">Results unlock when this poll closes.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {poll.kind === "ranked" ? (
              <ol className="space-y-2" aria-label={`Rank choices for ${poll.question}`}>
                {ranking.map((optionId, index) => {
                  const option = poll.options.find((candidate) => candidate.id === optionId);
                  if (!option) return null;
                  return (
                    <li key={option.id} className="flex items-center gap-3 rounded-xl border border-secondary bg-secondary p-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-brand-secondary">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-primary">{option.label}</p>
                        {option.mediaUrl ? <ChoiceMedia url={option.mediaUrl} compact /> : null}
                      </div>
                      <div className="flex gap-1">
                        <button type="button" disabled={!canVote || index === 0} onClick={() => moveRank(index, -1)} aria-label={`Move ${option.label} up`} className={rankButtonClass}><ChevronUp size={15} /></button>
                        <button type="button" disabled={!canVote || index === ranking.length - 1} onClick={() => moveRank(index, 1)} aria-label={`Move ${option.label} down`} className={rankButtonClass}><ChevronDown size={15} /></button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <RadioGroup size="md" aria-label={poll.question} value={selected ?? ""} onChange={setSelected} isDisabled={!canVote || submitting}>
                {poll.options.map((option) => (
                  <label key={option.id} className={cx("flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition", selected === option.id ? "border-brand bg-brand-primary" : "border-secondary bg-secondary hover:border-brand")}>
                    <RadioButton value={option.id} label={option.label} size="md" />
                    {option.mediaUrl ? <ChoiceMedia url={option.mediaUrl} compact /> : null}
                  </label>
                ))}
              </RadioGroup>
            )}
            {error ? <p role="alert" className="text-sm font-medium text-error-primary">{error}</p> : null}
            {canVote ? (
              <Button size="lg" color="primary" isDisabled={(poll.kind !== "ranked" && !selected) || submitting} isLoading={submitting} onClick={() => void submit()} iconLeading={CheckCircle}>
                {poll.kind === "ranked" ? "Submit ranking" : "Vote"}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-secondary bg-secondary p-4">
                <p className="text-sm text-secondary">{authLoading ? "Checking your session…" : "Sign in to vote once."}</p>
                {!authLoading ? <Button href="/login" size="sm" color="primary">Sign in</Button> : null}
              </div>
            )}
          </div>
        )}
        {(showResults || hasVoted) && !closed ? <p className="mt-5 text-xs text-quaternary">One ballot per account. House Super support counts 1.25× toward percentages; the people count stays unweighted.{poll.kind === "ranked" ? " Ranked results give more points to higher positions." : ""}</p> : null}
      </div>
    </section>
  );
}

function PollResults({ poll }: { poll: Poll }) {
  const lead = Math.max(0, ...poll.options.map((option) => option.weightedScore));
  return (
    <div className="space-y-4">
      {poll.options.map((option) => {
        const mine = poll.kind === "ranked"
          ? poll.myRanking?.includes(option.id) ?? false
          : poll.myOptionId === option.id;
        const myRank = poll.myRanking?.indexOf(option.id) ?? -1;
        const leader = option.weightedScore === lead && lead > 0;
        const winner = poll.winnerOptionId === option.id;
        return (
          <div key={option.id}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="inline-flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold text-primary">
                {option.label}
                {winner ? <Badge type="pill-color" color="success" size="sm">Winner</Badge> : null}
                {mine ? <Badge type="pill-color" color="brand" size="sm">{poll.kind === "ranked" ? `Your #${myRank + 1}` : "Your vote"}</Badge> : null}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-secondary">{option.pct}% <span className="font-normal text-quaternary">· {poll.kind === "ranked" ? formatScore(option.weightedScore) : option.votes}</span></span>
            </div>
            {option.mediaUrl ? <ChoiceMedia url={option.mediaUrl} compact /> : null}
            <ProgressBar value={option.pct} progressClassName={cx(!leader && "bg-fg-quaternary")} />
          </div>
        );
      })}
      <details className="pt-1 text-xs text-quaternary">
        <summary className="cursor-pointer font-medium hover:text-secondary">How results are counted</summary>
        <p className="mt-2 leading-relaxed">{poll.totalVotes} unique voters · weighted score {formatScore(poll.weightedScore)}. {poll.kind === "ranked" ? "Each ballot gives the most points to #1, then steps down by rank." : "Percentages use the weighted score; every account still submits only one choice."}</p>
      </details>
    </div>
  );
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

function timeUntil(value: string): string {
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "closing now";
  const hours = Math.ceil(diff / 3_600_000);
  if (hours < 24) return `closes in ${hours}h`;
  const days = Math.ceil(hours / 24);
  return `closes in ${days}d`;
}

const rankButtonClass = "grid size-9 place-items-center rounded-lg border border-secondary bg-primary text-tertiary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-30";

function PollHeroMedia({ url }: { url: string }) {
  return <div className="mt-4 max-w-[520px] overflow-hidden rounded-xl border border-secondary bg-secondary"><ChoiceMedia url={url} /></div>;
}

function ChoiceMedia({ url, compact = false }: { url: string; compact?: boolean }) {
  const youtube = youtubeId(url);
  const imageUrl = youtube ? `https://i.ytimg.com/vi/${youtube}/hqdefault.jpg` : url;
  const isImage = youtube || url.startsWith("/api/") || /\.(?:avif|gif|jpe?g|png|webp)(?:\?.*)?$/i.test(url);
  const isVideo = /\.(?:mp4|webm|mov)(?:\?.*)?$/i.test(url);
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={cx("block overflow-hidden rounded-lg bg-black", compact ? "mt-2 h-14 w-24" : "aspect-video w-full")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Choice media" className="size-full object-cover" loading="lazy" />
      </a>
    );
  }
  if (isVideo) {
    return <video src={url} controls preload="metadata" className={cx("rounded-lg bg-black", compact ? "mt-2 h-14 w-24" : "aspect-video w-full")} />;
  }
  return <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-secondary"><Film size={13} /> View attached media</a>;
}

function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.hostname.endsWith("youtube.com")) {
      if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
        return url.pathname.split("/").filter(Boolean)[1] ?? null;
      }
      return url.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}
