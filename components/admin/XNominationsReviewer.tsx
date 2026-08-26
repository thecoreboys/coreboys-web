"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, LockKeyhole, Star, X } from "lucide-react";
import type { XNominationPublic } from "@/lib/x/types";

type AdminNomination = XNominationPublic & { userId: string; reviewedBy: string | null };
type Usage = {
  summary: { estimatedSpendUsd: number; pendingReservedUsd: number; remainingGateUsd: number; monthlyCeilingUsd: number; declaredCreditBalanceUsd: number; requestCount: number; cacheHits: number };
  cache: { entries: number; fresh: number; hits: number };
  actions: Record<string, number>;
  readiness: Record<string, boolean | number | string>;
};

export function XNominationsReviewer() {
  const [status, setStatus] = useState<"pending" | "approved" | "denied" | "all">("pending");
  const [items, setItems] = useState<AdminNomination[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pruning, setPruning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nominations, monitoring] = await Promise.all([
        fetch(`/api/admin/x/nominations?status=${status}`, { cache: "no-store" }),
        fetch("/api/admin/x/usage", { cache: "no-store" }),
      ]);
      if (!nominations.ok) throw new Error("Could not load nominations.");
      setItems(((await nominations.json()) as { nominations?: AdminNomination[] }).nominations ?? []);
      if (monitoring.ok) setUsage(await monitoring.json() as Usage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load X review.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function decide(item: AdminNomination, nextStatus: "approved" | "denied", featured = false) {
    const denialReason = nextStatus === "denied" ? window.prompt("Private denial reason shown to the submitter:", "Not selected") : undefined;
    if (nextStatus === "denied" && denialReason === null) return;
    setBusy(item.id);
    setError(null);
    try {
      const response = await fetch("/api/admin/x/nominations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status: nextStatus, featured, denialReason }),
      });
      if (!response.ok) throw new Error("The moderation decision was not saved.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The moderation decision was not saved.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {usage ? (
        <section aria-label="X API safety monitoring">
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Estimated month spend" value={`$${usage.summary.estimatedSpendUsd.toFixed(2)}`} />
            <Metric label="Pending reservations" value={`$${usage.summary.pendingReservedUsd.toFixed(2)}`} />
            <Metric label="Remaining safety gate" value={`$${usage.summary.remainingGateUsd.toFixed(2)}`} />
            <Metric label="Fresh cache entries" value={`${usage.cache.fresh}/${usage.cache.entries}`} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-secondary bg-primary p-4 text-xs text-tertiary">
            <span>Declared credits: ${usage.summary.declaredCreditBalanceUsd.toFixed(2)} · Monthly cap: ${usage.summary.monthlyCeilingUsd.toFixed(2)} · Cache hits: {usage.cache.hits}</span>
            <span>Native actions: {usage.readiness.explicitWriteEnable ? "operator enabled" : "safely disabled"}</span>
            <button
              type="button"
              disabled={pruning}
              className="rounded-lg border border-secondary px-3 py-2 font-semibold text-primary"
              onClick={async () => {
                setPruning(true);
                try { await fetch("/api/admin/x/usage", { method: "DELETE" }); await load(); } finally { setPruning(false); }
              }}
            >{pruning ? "Pruning…" : "Prune expired cache"}</button>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-secondary bg-primary p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-primary">Curated X nominations</h2>
            <p className="mt-1 text-sm text-tertiary">The submitter note below is private moderator context and is never published with the approved embed.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["pending", "approved", "denied", "all"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${status === value ? "border-primary bg-active text-primary" : "border-secondary text-tertiary"}`}>
                {value[0]?.toUpperCase()}{value.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="mt-4 rounded-xl border border-error-subtle bg-error-primary p-3 text-sm text-error-primary">{error}</p> : null}
        {loading ? <p className="mt-6 text-sm text-tertiary">Loading…</p> : null}
        {!loading && items.length === 0 ? <p className="mt-6 rounded-xl border border-secondary p-5 text-sm text-tertiary">No nominations in this view.</p> : null}
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-secondary bg-secondary p-4">
              <div className="flex items-start justify-between gap-3">
                <div><span className="text-xs font-semibold uppercase tracking-wider text-brand-secondary">{item.communityKey}</span><p className="mt-1 text-xs text-quaternary">{new Date(item.submittedAt).toLocaleString()}</p></div>
                {item.featured ? <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary_alt px-2 py-1 text-xs font-semibold text-brand-secondary"><Star className="size-3" /> Featured</span> : null}
              </div>
              <a href={item.postUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Open exact post <ExternalLink className="size-4" /></a>
              {item.note ? <div className="mt-3 rounded-lg border border-secondary p-3"><span className="inline-flex items-center gap-1 text-xs font-semibold text-tertiary"><LockKeyhole className="size-3" /> Private note</span><p className="mt-1 text-sm text-secondary">{item.note}</p></div> : null}
              {item.denialReason ? <p className="mt-3 text-sm text-error-primary">Denied: {item.denialReason}</p> : null}
              {item.status === "pending" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button disabled={busy === item.id} type="button" onClick={() => void decide(item, "approved", false)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary"><Check className="size-4" /> Approve</button>
                  <button disabled={busy === item.id} type="button" onClick={() => void decide(item, "approved", true)} className="inline-flex items-center gap-1 rounded-lg border border-brand px-3 py-2 text-xs font-semibold text-brand-secondary"><Star className="size-4" /> Feature</button>
                  <button disabled={busy === item.id} type="button" onClick={() => void decide(item, "denied")} className="inline-flex items-center gap-1 rounded-lg border border-error-subtle px-3 py-2 text-xs font-semibold text-error-primary"><X className="size-4" /> Deny</button>
                </div>
              ) : item.status === "approved" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={busy === item.id}
                    type="button"
                    onClick={() => void decide(item, "approved", !item.featured)}
                    className="inline-flex items-center gap-1 rounded-lg border border-brand px-3 py-2 text-xs font-semibold text-brand-secondary"
                  >
                    <Star className="size-4" /> {item.featured ? "Remove feature" : "Make site feature"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-secondary bg-primary p-4"><p className="text-xs font-semibold text-tertiary">{label}</p><p className="mt-1 text-lg font-semibold text-primary">{value}</p></div>;
}
