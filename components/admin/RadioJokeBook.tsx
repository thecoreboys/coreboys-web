"use client";

import { useEffect, useMemo, useState } from "react";

type NetworkSlug = "core" | "adapt" | "ron" | "lacy" | "marlon" | "jason" | "silky";
type JokeStatus = "draft" | "approved" | "archived";
type Context = { id: string; networkSlug: NetworkSlug; subjectLabel: string; premise: string; enabled: boolean };
type Draft = { id: string; networkSlug: NetworkSlug; contextIds: string[]; script: string; status: JokeStatus; model: string; createdAt: string };
type JokeBook = { contexts: Context[]; drafts: Draft[] };

const NETWORKS: Array<{ value: NetworkSlug; label: string }> = [
  { value: "core", label: "CORE" }, { value: "adapt", label: "Flock / Adapt" }, { value: "ron", label: "Stable / Ron" }, { value: "lacy", label: "Thugs / Lacy" }, { value: "marlon", label: "M3 / Marlon" }, { value: "jason", label: "NMS / Jason" }, { value: "silky", label: "SLG / Silky" },
];
const input = "h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const button = "inline-flex min-h-10 items-center justify-center rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-primary transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50";
const primary = "inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-solid px-4 text-sm font-semibold text-white transition hover:bg-brand-solid_hover disabled:cursor-not-allowed disabled:opacity-50";

export function RadioJokeBook() {
  const [data, setData] = useState<JokeBook>({ contexts: [], drafts: [] });
  const [network, setNetwork] = useState<NetworkSlug>("ron");
  const [subject, setSubject] = useState("");
  const [premise, setPremise] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function request(body?: Record<string, unknown>) {
    const response = await fetch("/api/admin/radio/jokes", { method: body ? "POST" : "GET", credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json() as JokeBook & { error?: string };
    if (!response.ok) throw new Error(json.error ?? "DJ Cora joke request failed.");
    setData({ contexts: json.contexts ?? [], drafts: json.drafts ?? [] });
  }

  useEffect(() => { void request().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load the joke book.")); }, []);

  async function act(kind: string, body: Record<string, unknown>, success: string) {
    setBusy(kind); setError(""); setNotice("");
    try { await request(body); setNotice(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Request failed."); }
    finally { setBusy(null); }
  }

  const networkContexts = useMemo(() => data.contexts.filter((entry) => entry.networkSlug === network), [data.contexts, network]);
  const visibleDrafts = useMemo(() => data.drafts.filter((entry) => entry.networkSlug === network), [data.drafts, network]);

  return <section className="space-y-5 rounded-xl border border-secondary bg-primary p-5 shadow-xs">
    <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-secondary">Admin-only comedy context</p><h2 className="mt-1 text-xl font-semibold text-primary">DJ Cora joke book</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-tertiary">Add inside jokes, recurring bits, or production lore here. Generate creates six text drafts only—nothing is spoken or sent to viewers until you approve it, record it, and add the finished audio to the cue catalog above.</p></div>
    <div className="rounded-lg border border-warning-subtle bg-warning-primary p-3 text-sm text-primary"><strong>Comedy guardrails:</strong> mature banter and mild swearing are fine; the generator treats every premise as a fictional bit, not a factual claim. It will avoid medical, addiction, criminal, sexual, hateful, threatening, or protected-trait jokes about real people.</div>
    {error ? <p role="alert" className="rounded-lg border border-error_subtle bg-error-primary p-3 text-sm text-primary">{error}</p> : null}
    {notice ? <p role="status" className="rounded-lg border border-success_subtle bg-success-primary p-3 text-sm text-primary">{notice}</p> : null}
    <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-semibold text-tertiary">Network<select className={`${input} mt-1 min-w-44`} value={network} onChange={(event) => setNetwork(event.target.value as NetworkSlug)}>{NETWORKS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label><button type="button" className={primary} disabled={busy !== null || networkContexts.filter((entry) => entry.enabled).length === 0} onClick={() => void act("generate", { action: "generate", networkSlug: network }, "Six DJ Cora drafts were created for review.")}>{busy === "generate" ? "Writing drafts…" : "Generate 6 draft jokes"}</button><span className="text-xs text-tertiary">Uses the existing Anthropic limits and spend cap.</span></div>
    <form className="grid gap-3 rounded-lg border border-secondary p-4 md:grid-cols-[180px_1fr]" onSubmit={(event) => { event.preventDefault(); if (!subject.trim() || !premise.trim()) return; void act("add", { action: "create-context", networkSlug: network, subjectLabel: subject, premise, enabled: true }, "Joke context added."); setSubject(""); setPremise(""); }}><div className="md:col-span-2"><h3 className="font-semibold text-primary">Add a comedy premise</h3><p className="mt-1 text-xs text-tertiary">Example: “Ron’s cold-start is loud enough to reset the neighborhood Wi‑Fi.” Use harmless exaggerated setups, not allegations.</p></div><input className={input} value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={80} placeholder="Subject / bit label" /><textarea className="min-h-20 w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20" value={premise} onChange={(event) => setPremise(event.target.value)} maxLength={900} placeholder="What is the running joke or production bit?" /><div className="md:col-span-2"><button className={button} disabled={busy !== null}>Add context</button></div></form>
    <div className="grid gap-5 xl:grid-cols-2"><div><h3 className="font-semibold text-primary">{NETWORKS.find((entry) => entry.value === network)?.label} context</h3><div className="mt-3 space-y-3">{networkContexts.map((entry) => <ContextCard key={entry.id} entry={entry} busy={busy !== null} onSave={(next) => void act(`context:${entry.id}`, { action: "update-context", ...next }, "Context updated.")} onDelete={() => { if (window.confirm("Remove this DJ Cora joke context?")) void act(`delete:${entry.id}`, { action: "delete-context", id: entry.id }, "Context removed."); }} />)}{!networkContexts.length ? <p className="rounded-lg border border-dashed border-secondary p-4 text-sm text-tertiary">Add a premise for this network before generating drafts.</p> : null}</div></div><div><h3 className="font-semibold text-primary">Draft scripts</h3><div className="mt-3 space-y-3">{visibleDrafts.map((draft) => <DraftCard key={draft.id} draft={draft} busy={busy !== null} onStatus={(status) => void act(`draft:${draft.id}`, { action: "update-draft", id: draft.id, status }, status === "approved" ? "Draft approved for recording." : "Draft archived.")} />)}{!visibleDrafts.length ? <p className="rounded-lg border border-dashed border-secondary p-4 text-sm text-tertiary">Generated drafts stay here for review; none are public automatically.</p> : null}</div></div></div>
  </section>;
}

function ContextCard({ entry, busy, onSave, onDelete }: { entry: Context; busy: boolean; onSave: (next: Context) => void; onDelete: () => void }) {
  const [subject, setSubject] = useState(entry.subjectLabel); const [premise, setPremise] = useState(entry.premise); const [enabled, setEnabled] = useState(entry.enabled);
  useEffect(() => { setSubject(entry.subjectLabel); setPremise(entry.premise); setEnabled(entry.enabled); }, [entry]);
  return <article className="rounded-lg border border-secondary p-3"><div className="flex items-center justify-between gap-3"><input className="h-9 min-w-0 flex-1 rounded border border-secondary bg-primary px-2 text-sm font-semibold text-primary" value={subject} maxLength={80} onChange={(event) => setSubject(event.target.value)} /><label className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-tertiary"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Active</label></div><textarea className="mt-2 min-h-20 w-full rounded border border-secondary bg-primary px-2 py-2 text-sm text-primary" value={premise} maxLength={900} onChange={(event) => setPremise(event.target.value)} /><div className="mt-3 flex gap-2"><button type="button" className={button} disabled={busy || !subject.trim() || !premise.trim()} onClick={() => onSave({ ...entry, subjectLabel: subject, premise, enabled })}>Save</button><button type="button" className="inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-semibold text-error-primary transition hover:bg-error-primary/10 disabled:opacity-50" disabled={busy} onClick={onDelete}>Remove</button></div></article>;
}

function DraftCard({ draft, busy, onStatus }: { draft: Draft; busy: boolean; onStatus: (status: JokeStatus) => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(draft.script); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* browser will keep the visible script available */ } }
  return <article className="rounded-lg border border-secondary p-3"><p className="text-sm leading-relaxed text-primary">“{draft.script}”</p><div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full border border-secondary px-2 py-1 font-semibold text-tertiary">{draft.status}</span><button type="button" className={button} onClick={() => void copy()}>{copied ? "Copied" : "Copy script"}</button>{draft.status === "draft" ? <button type="button" className={button} disabled={busy} onClick={() => onStatus("approved")}>Approve for recording</button> : null}{draft.status !== "archived" ? <button type="button" className="inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-semibold text-tertiary transition hover:bg-secondary" disabled={busy} onClick={() => onStatus("archived")}>Archive</button> : null}</div></article>;
}
