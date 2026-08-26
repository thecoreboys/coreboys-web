"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Flame, Heart, Sparkles, Trophy } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";

type Mission = { id: string; label: string; progress: number; goal: number; href: string };
type Summary = {
  signedIn: boolean;
  points?: number;
  tier?: string;
  nextTierAt?: number | null;
  streak?: number;
  submissions?: number;
  approved?: number;
  favoriteMember?: string | null;
  missions?: Mission[];
};

export function FanZonePulse() {
  const { user, loading: authLoading } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (authLoading) return;
    void fetch("/api/fanzone/summary", { credentials: "same-origin", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Summary | null) => setSummary(data))
      .catch(() => setSummary(null));
  }, [authLoading, user?.id]);

  const nextMission = useMemo(
    () => summary?.missions?.find((mission) => mission.progress < mission.goal) ?? summary?.missions?.[0],
    [summary],
  );

  if (authLoading) return null;
  if (!user) {
    return (
      <div className="border-b border-secondary bg-secondary">
        <div className="mx-auto flex max-w-container flex-wrap items-center gap-3 px-6 py-4 md:px-8">
          <Sparkles size={16} className="text-brand-secondary" />
          <p className="text-sm text-tertiary"><strong className="font-semibold text-primary">Make it yours.</strong> Sign in for submission history, CORE reactions, missions, and your fan score.</p>
          <Link href="/login" className="ml-auto text-sm font-semibold text-brand-secondary">Sign in</Link>
        </div>
      </div>
    );
  }
  if (!summary?.signedIn) return null;

  return (
    <section aria-label="Your FanZone summary" className="border-b border-secondary bg-secondary">
      <div className="mx-auto max-w-container px-6 py-5 md:px-8">
        <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
          <div className="min-w-[150px]">
            <p className="text-xs font-semibold uppercase tracking-wide text-quaternary">Your FanZone</p>
            <p className="mt-1 text-lg font-semibold tracking-tight text-primary">Hey, {user.displayName.split(/\s+/)[0]}</p>
          </div>
          <Metric icon={<Trophy size={15} />} value={(summary.points ?? 0).toLocaleString()} label={summary.tier ?? "Fan"} />
          <Metric icon={<Flame size={15} />} value={String(summary.streak ?? 0)} label="day streak" />
          <Metric icon={<Check size={15} />} value={String(summary.approved ?? 0)} label="on the wall" />
          {summary.favoriteMember ? <Metric icon={<Heart size={15} />} value={summary.favoriteMember} label="favorite member" /> : null}
          {nextMission ? (
            <a href={nextMission.href} className="ml-auto min-w-[220px] rounded-xl border border-secondary bg-primary px-4 py-3 transition hover:border-brand">
              <div className="flex items-center justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Next mission</p><p className="mt-0.5 text-sm font-semibold text-primary">{nextMission.label}</p></div>
                <span className="text-xs font-semibold tabular-nums text-tertiary">{nextMission.progress}/{nextMission.goal}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-brand-solid" style={{ width: `${Math.min(100, (nextMission.progress / nextMission.goal) * 100)}%` }} /></div>
            </a>
          ) : null}
        </div>
        {(summary.missions?.length ?? 0) > 1 ? (
          <details className="group mt-4">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-tertiary hover:text-primary">This week <ChevronDown size={13} className="transition group-open:rotate-180" /></summary>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {summary.missions?.map((mission) => <li key={mission.id}><a href={mission.href} className="flex items-center justify-between rounded-lg bg-primary px-3 py-2.5 text-sm"><span className="font-medium text-secondary">{mission.label}</span><span className="text-xs tabular-nums text-quaternary">{mission.progress}/{mission.goal}</span></a></li>)}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-primary text-brand-secondary ring-1 ring-inset ring-secondary">{icon}</span><span><strong className="block text-sm font-semibold tabular-nums text-primary">{value}</strong><span className="block text-[11px] text-quaternary">{label}</span></span></div>;
}
