"use client";

import { useEffect, useState } from "react";

type Original = { id: string; slug: string; title: string; summary: string | null; posterUrl: string; enabled: boolean; sortOrder: number };
type Item = { id: string; originalId: string; sourceUrl: string; platform: string; title: string; subtitle: string | null; posterUrl: string | null; format: string; status: "pending" | "approved" | "rejected"; recommendationNote: string | null; sortOrder: number };
type Snapshot = { originals: Original[]; items: Item[] };
const EMPTY: Snapshot = { originals: [], items: [] };
const input = "h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
const card = "rounded-xl border border-secondary bg-primary p-5 shadow-xs";
const action = "inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-solid px-4 text-sm font-semibold text-white transition hover:bg-brand-solid_hover disabled:opacity-50";

export function CoreOriginalsManager() {
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("");
  const [finder, setFinder] = useState("");
  async function request(method: "GET" | "POST" | "PATCH", body?: unknown) {
    setBusy(true); setNotice("");
    try { const response = await fetch("/api/admin/originals", { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" }); const json = await response.json(); if (!response.ok) throw new Error(json.error ?? "Request failed"); setData(json); setNotice("Saved"); return true; }
    catch (error) { setNotice(error instanceof Error ? error.message : "Request failed"); return false; }
    finally { setBusy(false); }
  }
  useEffect(() => { void request("GET"); }, []);
  const active = data.originals.find((entry) => entry.id === selected) ?? data.originals[0] ?? null;
  const activeItems = active ? data.items.filter((entry) => entry.originalId === active.id) : [];
  return <div className="space-y-8">
    {notice ? <p role="status" className="rounded-lg border border-secondary bg-primary px-4 py-3 text-sm text-secondary">{notice}</p> : null}
    <section className={card}><h2 className="text-lg font-semibold text-primary">Create a CORE Original</h2><p className="mt-1 text-sm text-tertiary">Each original gets a public collection page and a private approval queue.</p>
      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget); void request("POST", { action: "create-original", slug: value.get("slug"), title: value.get("title"), summary: value.get("summary") || null, posterUrl: value.get("posterUrl"), sortOrder: Number(value.get("sortOrder") || 100), enabled: true }).then((ok) => { if (ok) event.currentTarget.reset(); }); }}>
        <input className={input} name="title" required placeholder="Title" /><input className={input} name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="URL slug" /><input className={input} name="posterUrl" required placeholder="/brand/events-series-challenges/poster.png" /><input className={input} name="sortOrder" type="number" defaultValue="100" /><textarea className={`${input} min-h-24 md:col-span-2`} name="summary" placeholder="Short public description (optional)" /><button className={`${action} w-fit`} disabled={busy}>Create original</button>
      </form>
    </section>
    <section className={card}><label className="text-sm font-semibold text-primary">Manage an original<select value={active?.id ?? ""} onChange={(event) => setSelected(event.target.value)} className={`${input} mt-2`}>{data.originals.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>
      {active ? <div className="mt-5 space-y-6">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget); void request("PATCH", { action: "update-original", id: active.id, slug: value.get("slug"), title: value.get("title"), summary: value.get("summary") || null, posterUrl: value.get("posterUrl"), sortOrder: Number(value.get("sortOrder") || 100), enabled: value.get("enabled") === "on" }); }}><input className={input} name="title" defaultValue={active.title} /><input className={input} name="slug" defaultValue={active.slug} /><input className={input} name="posterUrl" defaultValue={active.posterUrl} /><input className={input} name="sortOrder" type="number" defaultValue={active.sortOrder} /><textarea className={`${input} min-h-20 md:col-span-2`} name="summary" defaultValue={active.summary ?? ""} /><label className="text-sm text-secondary"><input name="enabled" type="checkbox" defaultChecked={active.enabled} /> Visible on site</label><button className={`${action} w-fit`} disabled={busy}>Save collection</button></form>
        <div className="border-t border-secondary pt-5"><h3 className="font-semibold text-primary">Find recommendations — approval required</h3><p className="mt-1 text-sm text-tertiary">Search the existing CORE catalog. Matches are added as pending only; they never appear publicly until approved below.</p><div className="mt-3 flex gap-2"><input className={input} value={finder} onChange={(event) => setFinder(event.target.value)} placeholder="e.g. basketball, Fortnite, IRL" /><button className={action} disabled={busy || finder.trim().length < 2} onClick={() => void request("POST", { action: "find-recommendations", originalId: active.id, query: finder })}>Find</button></div></div>
        <AddItem originalId={active.id} request={request} busy={busy} />
        <div className="border-t border-secondary pt-5"><h3 className="font-semibold text-primary">Approval queue</h3><div className="mt-3 space-y-2">{activeItems.map((entry) => <div key={entry.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-secondary p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-primary">{entry.title}</p><p className="truncate text-xs text-tertiary">{entry.status}{entry.recommendationNote ? ` · ${entry.recommendationNote}` : ""}</p></div>{entry.status === "pending" ? <><button className={action} disabled={busy} onClick={() => void request("PATCH", { action: "review-item", id: entry.id, status: "approved" })}>Approve</button><button className="text-sm font-semibold text-error-primary" disabled={busy} onClick={() => void request("PATCH", { action: "review-item", id: entry.id, status: "rejected" })}>Reject</button></> : <a className="text-sm font-semibold text-brand-secondary" href={entry.sourceUrl} target="_blank" rel="noreferrer">Open</a>}</div>)}{!activeItems.length ? <p className="text-sm text-tertiary">No items yet.</p> : null}</div></div>
      </div> : <p className="mt-4 text-sm text-tertiary">Create an original to begin.</p>}
    </section>
  </div>;
}

function AddItem({ originalId, request, busy }: { originalId: string; request: (method: "GET" | "POST" | "PATCH", body?: unknown) => Promise<boolean>; busy: boolean }) {
  return <form className="border-t border-secondary pt-5" onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget); void request("POST", { action: "add-item", originalId, sourceUrl: value.get("sourceUrl"), platform: value.get("platform"), title: value.get("title"), subtitle: value.get("subtitle") || null, posterUrl: value.get("posterUrl") || null, format: value.get("format"), status: "approved" }).then((ok) => { if (ok) event.currentTarget.reset(); }); }}><h3 className="font-semibold text-primary">Add an approved item</h3><div className="mt-3 grid gap-3 md:grid-cols-2"><input className={input} name="title" required placeholder="Title" /><input className={input} name="sourceUrl" type="url" required placeholder="Public video URL" /><select className={input} name="platform"><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="twitch">Twitch</option><option value="x">X</option><option value="other">Other</option></select><select className={input} name="format"><option value="auto">Auto</option><option value="long">Video</option><option value="short">Short</option><option value="photo">Photo</option></select><input className={input} name="posterUrl" type="url" placeholder="Poster URL (optional)" /><input className={input} name="subtitle" placeholder="Subtitle (optional)" /></div><button className={`${action} mt-3`} disabled={busy}>Add to public collection</button></form>;
}
