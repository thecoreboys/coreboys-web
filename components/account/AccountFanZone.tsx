"use client";

import { useEffect, useState } from "react";
import { Trophy01, Star01, Zap, BarChart01, Heart } from "@untitledui/icons";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { Badge } from "@/components/base/badges/badges";
import { ProgressBar } from "@/components/base/progress-indicators/progress-indicators";
import { cx } from "@/utils/cx";

type BadgeTier = "Tier 1 Fan" | "OG" | "Super Fan";
type Activity = { type: string; label: string; points: number; at: string };
type Summary = {
  points: number;
  tier: BadgeTier;
  nextTierAt: number | null;
  activity: Activity[];
};

const TIER_META: Record<BadgeTier, { icon: typeof Trophy01; floor: number }> = {
  "Tier 1 Fan": { icon: Star01, floor: 0 },
  OG: { icon: Trophy01, floor: 100 },
  "Super Fan": { icon: Zap, floor: 500 },
};

/**
 * Fan score card: points, badge tier, and recent activity from the account
 * summary endpoint. Go-live alerts live in Notifications › Creator alerts.
 */
export function AccountFanZone() {
  return <PointsCard />;
}

function PointsCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch("/api/account/summary", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Summary) => {
        if (cancelled) return;
        if (d && typeof d.points === "number" && TIER_META[d.tier]) setSummary(d);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (failed && !summary) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3" role="alert">
        <p className="text-sm text-tertiary">Your fan score couldn&apos;t be loaded.</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-primary ring-1 ring-inset ring-secondary hover:bg-primary_hover">Try again</button>
      </div>
    );
  }

  if (!summary) {
    return <div className="h-48 animate-pulse rounded-xl bg-secondary" role="status" aria-label="Loading fan score" />;
  }

  const meta = TIER_META[summary.tier];
  const floor = meta.floor;
  const next = summary.nextTierAt;
  const toNext = next != null ? Math.max(0, next - summary.points) : 0;
  const pct =
    next != null && next > floor
      ? Math.min(100, Math.round(((summary.points - floor) / (next - floor)) * 100))
      : 100;

  return (
    <section aria-label="Fan score">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <FeaturedIcon icon={meta.icon} size="lg" color="brand" theme="modern" />
          <div>
            <p className="text-sm font-medium text-tertiary">Your fan score</p>
            <p className="text-display-sm font-semibold tabular-nums leading-none tracking-tight text-primary">
              {summary.points.toLocaleString("en-US")}
              <span className="ml-1.5 text-md font-medium text-quaternary">pts</span>
            </p>
          </div>
        </div>
        <Badge type="pill-color" color="brand" size="lg">
          {summary.tier}
        </Badge>
      </div>

      <div className="mt-6">
        {next != null ? (
          <>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-secondary">
                {toNext} pts to{" "}
                {summary.tier === "Tier 1 Fan" ? "OG" : "Super Fan"}
              </span>
              <span className="text-sm font-semibold tabular-nums text-secondary">{pct}%</span>
            </div>
            <ProgressBar value={pct} />
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-secondary bg-primary p-3 shadow-xs-skeuomorphic">
            <Zap className="size-4 text-brand-secondary" />
            <p className="text-sm font-medium text-secondary">
              You&apos;ve hit the top tier. Certified Super Fan.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-secondary pt-5">
        <h3 className="mb-3 text-sm font-semibold text-primary">Recent activity</h3>
        {summary.activity.length === 0 ? (
          <p className="text-sm text-tertiary">
            No activity yet. Vote in a poll or upvote a clip to start earning points.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--color-border-secondary)]">
            {summary.activity.slice(0, 8).map((a, i) => {
              const Icon =
                a.type === "poll_vote"
                  ? BarChart01
                  : a.type === "clip_upvote"
                    ? Heart
                    : Star01;
              return (
                <li key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-tertiary ring-1 ring-inset ring-secondary">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-secondary">{a.label}</p>
                    <p className="text-xs text-quaternary">{relativeTime(a.at)}</p>
                  </div>
                  <span
                    className={cx(
                      "text-sm font-semibold tabular-nums",
                      a.points >= 0 ? "text-brand-secondary" : "text-tertiary",
                    )}
                  >
                    {a.points >= 0 ? "+" : ""}
                    {a.points}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function relativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  const m = 60_000;
  const h = 60 * m;
  const d = 24 * h;
  if (diff < h) return `${Math.max(1, Math.floor(diff / m))}m ago`;
  if (diff < d) return `${Math.floor(diff / h)}h ago`;
  if (diff < 14 * d) return `${Math.floor(diff / d)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
