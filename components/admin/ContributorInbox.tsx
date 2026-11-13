"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Badge } from "@/components/base/badges/badges";
import type { InboxSubmission, SubmissionCounts, SubmissionFilters } from "@/lib/contributors/validation";

type Cursor = { at: string; id: string };
const emptyCounts: SubmissionCounts = { total: 0, help: 0, suggestion: 0, new: 0 };
const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-secondary px-4 text-sm font-medium text-primary disabled:opacity-50";

export function ContributorInbox() {
  const [items, setItems] = useState<InboxSubmission[]>([]);
  const [next, setNext] = useState<Cursor | null>(null);
  const [counts, setCounts] = useState<SubmissionCounts>(emptyCounts);
  const [filters, setFilters] = useState<SubmissionFilters>({ kind: "all", status: "all" });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async (cursor: Cursor | null = null) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ ...filters, ...(cursor ?? {}) });
      const response = await fetch(`/api/admin/contributors?${params}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Sign in as an admin to view submissions." : data.error || "Could not load submissions.");
      if (controller.signal.aborted) return;
      setItems(previous => cursor ? [...previous, ...data.applications.filter((item: InboxSubmission) => !previous.some(existing => existing.id === item.id))] : data.applications);
      setNext(data.nextCursor); setCounts(data.counts);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load submissions.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, [filters]);

  useEffect(() => {
    setItems([]); setNext(null);
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  async function review(item: InboxSubmission) {
    if (updating) return;
    const status = item.status === "new" ? "reviewed" : "new";
    setUpdating(item.id); setError("");
    try {
      const response = await fetch("/api/admin/contributors", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the status.");
      setItems(previous => previous.flatMap(existing => existing.id !== item.id ? [existing]
        : filters.status !== "all" && filters.status !== status ? [] : [{ ...existing, status }]));
      setCounts(previous => ({ ...previous, new: Math.max(0, Math.min(previous.total, previous.new + (status === "new" ? 1 : -1))) }));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save the status."); }
    finally { setUpdating(null); }
  }

  async function copyContact(item: InboxSubmission) {
    try { await navigator.clipboard.writeText(item.contact); setCopied(item.id); }
    catch { setError("Copy isn’t available. Select the contact text to copy it."); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tertiary">{counts.new} new · {counts.total} total · Private to admins</p>
        <button className={actionClass} disabled={busy || !!updating} onClick={() => void load()}><RefreshCw size={15} aria-hidden />Refresh</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Submission type" className="flex max-w-full flex-wrap gap-1 rounded-xl border border-secondary bg-primary p-1">
          {([{ kind: "all", label: "All", count: counts.total }, { kind: "help", label: "Help signups", count: counts.help }, { kind: "suggestion", label: "Suggestions", count: counts.suggestion }] as const).map(option => (
            <button key={option.kind} aria-label={`${option.label} (${option.count})`} aria-pressed={filters.kind === option.kind} disabled={!!updating} className={`min-h-11 rounded-lg px-3 text-sm ${filters.kind === option.kind ? "bg-secondary font-semibold text-primary" : "text-tertiary"}`} onClick={() => setFilters(previous => ({ ...previous, kind: option.kind }))}>{option.label}<span className="ml-2 text-xs tabular-nums">{option.count}</span></button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-secondary">Status
          <select aria-label="Review status" disabled={!!updating} value={filters.status} onChange={event => setFilters(previous => ({ ...previous, status: event.target.value as SubmissionFilters["status"] }))} className="min-h-11 rounded-lg border border-secondary bg-primary px-3 text-primary">
            <option value="all">All</option><option value="new">New</option><option value="reviewed">Reviewed</option>
          </select>
        </label>
      </div>
      {error ? <p role="alert" className="rounded-xl border border-secondary p-4 text-sm text-primary">{error}</p> : null}
      {items.map(item => (
        <article key={item.id} className="min-w-0 rounded-2xl border border-secondary bg-primary p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2"><Badge type="pill-color" size="sm" color={item.kind === "help" ? "brand" : "blue"}>{item.kind === "help" ? "Help signup" : "Suggestion"}</Badge><Badge type="pill-color" size="sm" color={item.status === "new" ? "warning" : "gray"}>{item.status === "new" ? "New" : "Reviewed"}</Badge></div>
              <h2 className="mt-3 break-words text-xl font-semibold text-primary">{item.name || (item.contact ? "Community suggestion" : "Anonymous suggestion")}</h2>
              {item.kind === "help" ? <p className="mt-1 text-sm text-tertiary">{item.role}</p> : null}
            </div>
            <time className="text-xs text-tertiary" dateTime={new Date(item.submittedAt).toISOString()}>{new Date(item.submittedAt).toLocaleString()}</time>
          </div>
          <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-relaxed text-primary">{item.message}</p>
          {item.contact || item.legacyContacts || (item.kind === "help" && item.portfolio) ? <dl className="mt-5 grid gap-4 border-t border-secondary pt-4 text-sm sm:grid-cols-2">
            {item.contact ? <div className="min-w-0"><dt className="text-tertiary">Contact</dt><dd className="mt-1 flex flex-wrap items-center gap-x-3 break-all text-primary"><span>{item.contact}</span><button className="inline-flex min-h-11 items-center gap-1.5 text-xs text-secondary underline underline-offset-4" aria-label={`Copy contact for ${item.name || "suggestion"}`} onClick={() => void copyContact(item)}>{copied === item.id ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{copied === item.id ? "Copied" : "Copy"}</button></dd></div> : null}
            {item.kind === "help" && item.portfolio ? <div className="min-w-0"><dt className="text-tertiary">Portfolio</dt><dd className="mt-2 break-all text-primary"><a href={item.portfolio} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4">{item.portfolio} ↗</a></dd></div> : null}
            {item.legacyContacts ? Object.entries(item.legacyContacts).filter(([, value]) => value).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-tertiary">{key === "twitter" ? "Twitter / X" : key === "discord" ? "Discord" : "Phone"}</dt><dd className="mt-2 break-all text-primary">{value}</dd></div>) : null}
          </dl> : null}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-secondary pt-4">
            <p className="text-xs text-tertiary">Confirmed 13 or older</p>
            <button className={actionClass} disabled={busy || !!updating} onClick={() => void review(item)}>{updating === item.id ? "Saving…" : item.status === "new" ? <><Check size={15} aria-hidden />Mark reviewed</> : "Mark as new"}</button>
          </div>
        </article>
      ))}
      {!items.length && !busy && !error ? <p className="rounded-xl border border-dashed border-secondary p-10 text-center text-sm text-tertiary">{counts.total ? "No submissions match these filters." : "No submissions yet."}</p> : null}
      {busy ? <p role="status" className="text-sm text-tertiary">Loading submissions…</p> : null}
      {next ? <button className={actionClass} disabled={busy || !!updating} onClick={() => void load(next)}>Load more</button> : null}
    </div>
  );
}
