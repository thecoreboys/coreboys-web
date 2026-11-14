"use client";
import { useCallback, useEffect, useState } from "react";
import type { ContributorDetails } from "@/lib/contributors/validation";
type Application = ContributorDetails & { id: string; submittedAt: string };
type Cursor = { at: string; id: string };
export function ContributorInbox() {
  const [items,setItems] = useState<Application[]>([]); const [next,setNext] = useState<Cursor|null>(null);
  const [busy,setBusy] = useState(true); const [error,setError] = useState("");
  const load = useCallback(async (cursor: Cursor|null = null) => {
    setBusy(true); setError("");
    try {
      const params = cursor ? `?${new URLSearchParams(cursor)}` : "";
      const response = await fetch(`/api/admin/contributors${params}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Sign in as an admin to view applications." : data.error || "Could not load applications.");
      setItems(previous => cursor ? [...previous, ...data.applications.filter((item: Application) => !previous.some(existing => existing.id === item.id))] : data.applications); setNext(data.nextCursor);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not load applications."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-tertiary">Private to admins. Contact details are never published.</p><button className="min-h-11 rounded-lg border border-secondary px-4 text-sm text-primary" disabled={busy} onClick={() => void load()}>Refresh</button></div>
    {error ? <p role="alert" className="rounded-xl border border-secondary p-4 text-sm text-primary">{error}</p> : null}
    {items.map(item => <article key={item.id} className="min-w-0 rounded-2xl border border-secondary bg-primary p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-tertiary">{item.role}</p><h2 className="mt-1 break-words text-xl font-semibold text-primary">{item.firstName} {item.lastName}</h2></div><time className="text-xs text-tertiary" dateTime={new Date(item.submittedAt).toISOString()}>{new Date(item.submittedAt).toLocaleString()}</time></div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">{[["Twitter / X",item.twitter],["Discord",item.discord],["Phone",item.phone]].map(([label,value]) => <div key={label} className="min-w-0"><dt className="text-tertiary">{label}</dt><dd className="mt-1 break-all text-primary">{value || "Not provided"}</dd></div>)}<div className="min-w-0"><dt className="text-tertiary">Portfolio</dt><dd className="mt-1 break-all text-primary">{item.portfolio ? <a href={item.portfolio} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4">{item.portfolio} ↗</a> : "Not provided"}</dd></div></dl>
      <div className="mt-5 border-t border-secondary pt-4"><h3 className="text-sm font-medium text-secondary">How they can help</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-primary">{item.how}</p></div><p className="mt-4 text-xs text-tertiary">Confirmed 13 or older · Self-declared</p>
    </article>)}
    {!items.length && !busy && !error ? <p className="rounded-xl border border-dashed border-secondary p-10 text-center text-sm text-tertiary">No applications yet.</p> : null}
    {busy ? <p role="status" className="text-sm text-tertiary">Loading applications…</p> : null}
    {next ? <button className="min-h-11 rounded-lg border border-secondary px-4 text-sm text-primary" disabled={busy} onClick={() => void load(next)}>Load more</button> : null}
  </div>;
}
