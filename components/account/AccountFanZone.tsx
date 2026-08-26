"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy01, Star01, Zap, Bell01, BarChart01, Heart } from "@untitledui/icons";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { Badge } from "@/components/base/badges/badges";
import { ProgressBar } from "@/components/base/progress-indicators/progress-indicators";
import { Toggle } from "@/components/base/toggle/toggle";
import { cx } from "@/utils/cx";

type BadgeTier = "Tier 1 Fan" | "OG" | "Super Fan";
type Activity = { type: string; label: string; points: number; at: string };
type Summary = {
  points: number;
  tier: BadgeTier;
  nextTierAt: number | null;
  activity: Activity[];
};

type MemberLite = { slug: string; stageName: string };

const TIER_META: Record<BadgeTier, { icon: typeof Trophy01; floor: number }> = {
  "Tier 1 Fan": { icon: Star01, floor: 0 },
  OG: { icon: Trophy01, floor: 100 },
  "Super Fan": { icon: Zap, floor: 500 },
};

/**
 * Fan-zone account cards (Features 1, 5, 6): points + badge tier, recent
 * activity, and notification preferences. All read from the existing account
 * endpoints; nothing here is mocked.
 */
export function AccountFanZone({ members }: { members: MemberLite[] }) {
  return (
    <div className="mt-6 space-y-6">
      <PointsCard />
      <NotificationPrefsCard members={members} />
    </div>
  );
}

function PointsCard() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/summary", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Summary | null) => {
        if (!cancelled) setSummary(d);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!summary) {
    return (
      <section className="h-48 animate-pulse rounded-2xl bg-secondary ring-1 ring-inset ring-secondary" />
    );
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
    <section className="rounded-2xl bg-secondary p-6 shadow-xl ring-1 ring-inset ring-secondary">
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

function NotificationPrefsCard({ members }: { members: MemberLite[] }) {
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedScope, setSavedScope] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/notifications", { credentials: "same-origin" });
      const data = (await res.json()) as {
        prefs: Array<{ scope: string; liveOptIn: boolean }>;
      };
      const map: Record<string, boolean> = {};
      for (const p of data.prefs ?? []) map[p.scope] = p.liveOptIn;
      setPrefs(map);
    } catch {
      setPrefs({});
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setScope(scope: string, value: boolean) {
    setPrefs((p) => ({ ...(p ?? {}), [scope]: value }));
    setSaving(scope);
    try {
      const res = await fetch("/api/account/notifications", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, liveOptIn: value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSavedScope(scope);
      window.setTimeout(() => setSavedScope((s) => (s === scope ? null : s)), 1800);
    } catch {
      // Roll back on failure.
      setPrefs((p) => ({ ...(p ?? {}), [scope]: !value }));
    } finally {
      setSaving((s) => (s === scope ? null : s));
    }
  }

  if (!prefs) {
    return (
      <section className="h-64 animate-pulse rounded-2xl bg-secondary ring-1 ring-inset ring-secondary" />
    );
  }

  const globalOn = prefs.all ?? false;

  return (
    <section id="go-live-notifications" className="scroll-mt-28 rounded-2xl bg-secondary p-6 shadow-xl ring-1 ring-inset ring-secondary">
      <div className="flex items-start gap-4">
        <FeaturedIcon icon={Bell01} size="lg" color="brand" theme="modern" />
        <div>
          <h2 className="text-lg font-semibold text-primary">Go-live notifications</h2>
          <p className="mt-1 text-sm text-tertiary">
            Opt in and we&apos;ll notify you when they go live. (Delivery is rolling
            out soon — we&apos;re saving your picks now.)
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-secondary bg-primary p-4 shadow-xs-skeuomorphic">
        <div>
          <p className="text-sm font-semibold text-primary">Notify me for everyone</p>
          <p className="text-xs text-tertiary">Any CORE member going live.</p>
        </div>
        <div className="flex items-center gap-2">
          {savedScope === "all" ? (
            <span className="text-xs font-medium text-brand-secondary">Saved</span>
          ) : null}
          <Toggle
            size="md"
            isSelected={globalOn}
            isDisabled={saving === "all"}
            onChange={(v) => setScope("all", v)}
            aria-label="Notify me when any member goes live"
          />
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-3 text-sm font-semibold text-primary">Per member</p>
        <ul className="flex flex-col divide-y divide-[color:var(--color-border-secondary)]">
          {members.map((m) => {
            const on = prefs[m.slug] ?? false;
            return (
              <li
                key={m.slug}
                className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0"
              >
                <span className="text-sm font-medium text-secondary">{m.stageName}</span>
                <div className="flex items-center gap-2">
                  {savedScope === m.slug ? (
                    <span className="text-xs font-medium text-brand-secondary">Saved</span>
                  ) : null}
                  <Toggle
                    size="md"
                    isSelected={on}
                    isDisabled={saving === m.slug}
                    onChange={(v) => setScope(m.slug, v)}
                    aria-label={`Notify me when ${m.stageName} goes live`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
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
