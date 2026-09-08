"use client";

import { useEffect, useState, type FormEvent } from "react";
type Cue = { startSeconds: number; endSeconds: number; text: string };
type Import = { id: string; assetKey: string; title: string; language: string; status: string;
  expiresAt: string; rightsReference: string; cueCount: number; currentRevision: boolean };
const endpoint = "/api/admin/media-intelligence/transcripts";
const field = "min-h-11 w-full rounded-lg border border-secondary bg-primary p-3 text-primary";
const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-secondary bg-primary px-4 text-sm font-semibold text-primary disabled:opacity-50";
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function TranscriptManager() {
  const [imports, setImports] = useState<Import[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState<Record<string, Cue[]>>({});
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<{ assets: Array<{ active: number }>; jobs: Array<{ status: string; total: number }> } | null>(null);
  async function refresh() {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error("Transcript imports could not be loaded.");
      const data = await response.json();
      setImports(data.imports ?? []);
    } finally { setLoading(false); }
  }
  useEffect(() => { void refresh().catch((error) => setMessage(error.message)); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/media-intelligence", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => { if (!controller.signal.aborted && data?.assets && data?.jobs) setHealth(data); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function mutate(payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The transcript operation failed.");
      setMessage(payload.action === "import" ? "Saved for review. Nothing has been published yet." : `Transcript ${data.result.status}.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate({ action: "import", assetKey: data.get("assetKey"), language: data.get("language"),
      rightsReference: data.get("rightsReference"), rightsConfirmed: data.get("rightsConfirmed") === "on", source });
  }
  async function review(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`${endpoint}?id=${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Evidence could not be loaded.");
      const data = await response.json();
      setEvidence((current) => ({ ...current, [id]: data.cues ?? [] }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    {health ? <section className="grid gap-3 sm:grid-cols-3" aria-label="Index health">
      {[
        ["Active catalog assets", health.assets.reduce((sum, row) => sum + row.active, 0)],
        ["Queued analysis jobs", health.jobs.filter((row) => row.status === "queued").reduce((sum, row) => sum + row.total, 0)],
        ["Failed or dead-letter jobs", health.jobs.filter((row) => row.status === "failed" || row.status === "dead-letter").reduce((sum, row) => sum + row.total, 0)],
      ].map(([label, count]) => <div key={label} className="rounded-xl border border-secondary bg-primary p-5"><p className="text-sm text-tertiary">{label}</p><p className="mt-2 text-2xl font-semibold text-primary">{Number(count).toLocaleString()}</p></div>)}
    </section> : null}
    <section className="rounded-xl border border-secondary bg-primary p-5 text-sm leading-6 text-tertiary">
      <strong className="text-primary">Search real moments, with source evidence.</strong> Import an authorized WebVTT or SRT file, review its text and timing, then approve it for search. This path makes no paid AI calls. It does not download provider videos or invent scenes. Captions expire after 90 days; removed, restricted, changed or revoked sources stop appearing in search.
    </section>
    <form onSubmit={submit} className="grid gap-4 rounded-xl border border-secondary bg-primary p-5">
      <h2 className="text-lg font-semibold text-primary">Import reviewed captions</h2>
      <div className="grid gap-4 md:grid-cols-[1fr_10rem]">
        <label className="grid gap-2 text-sm text-primary">Indexed asset key<input className={field} name="assetKey" required maxLength={500} placeholder="youtube:provider-video-id" /></label>
        <label className="grid gap-2 text-sm text-primary">Language<input className={field} name="language" required defaultValue="en" pattern="[a-z]{2,3}(-[A-Za-z0-9]{2,8})?" /></label>
      </div>
      <label className="grid gap-2 text-sm text-primary">Caption file (VTT or SRT, up to 1 MB)<input type="file" accept=".vtt,.srt,text/vtt" className={field} onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 1_000_000) { setMessage("Captions must be smaller than 1 MB."); return; }
        setSource(await file.text());
      }} /></label>
      <label className="grid gap-2 text-sm text-primary">Or paste timed captions<textarea className={`${field} min-h-48 font-mono text-xs`} value={source} onChange={(event) => setSource(event.target.value)} required maxLength={1_000_000} /></label>
      <label className="grid gap-2 text-sm text-primary">Permission reference<input className={field} name="rightsReference" required minLength={8} maxLength={1000} placeholder="Who authorized processing, and when? Kept private to staff." /></label>
      <label className="flex items-start gap-3 text-sm text-tertiary"><input type="checkbox" name="rightsConfirmed" required className="mt-1 size-5 shrink-0" />I have permission to process and publish searchable excerpts of these captions, and have checked them for private information.</label>
      <button className={`${button} justify-self-start`} disabled={busy} type="submit">{busy ? "Working…" : "Save for review"}</button>
    </form>
    {message ? <p role="status" className="rounded-lg border border-secondary bg-primary p-4 text-sm text-primary">{message}</p> : null}
    <section className="space-y-4" aria-label="Transcript review queue">
      <h2 className="text-xl font-semibold text-primary">Recent imports</h2>
      {loading ? <p role="status">Loading imports…</p> : !imports.length ? <p className="text-tertiary">No transcripts imported yet. Metadata search remains available.</p> : null}
      {imports.map((entry) => <article key={entry.id} className="space-y-3 rounded-xl border border-secondary bg-primary p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold text-primary">{entry.title}</h3><span className="rounded-md bg-secondary px-2 py-1 text-xs text-primary">{entry.status}</span></div>
        <p className="break-all text-xs text-tertiary">{entry.assetKey} · {entry.language} · {entry.cueCount} cues · {entry.currentRevision ? "Current source" : "Source changed"}</p>
        <p className="text-sm text-tertiary">Permission: {entry.rightsReference} · Expires {new Date(entry.expiresAt).toLocaleDateString()}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy} onClick={() => void review(entry.id)}>Review captions</button>
          {entry.status === "draft" ? <><button type="button" className={button} disabled={busy || !evidence[entry.id]?.length || !entry.currentRevision} onClick={() => void mutate({ action: "approve", id: entry.id })}>Approve for search</button><button type="button" className={button} disabled={busy} onClick={() => void mutate({ action: "reject", id: entry.id })}>Reject</button></> : null}
          {entry.status === "approved" ? <button type="button" className={button} disabled={busy} onClick={() => void mutate({ action: "revoke", id: entry.id })}>Revoke from search</button> : null}
        </div>
        {evidence[entry.id] ? <div tabIndex={0} aria-label="Caption evidence" className="max-h-80 space-y-2 overflow-y-auto overscroll-contain rounded-lg border border-secondary p-3 text-sm text-primary">
          {evidence[entry.id]!.map((cue, index) => <p key={index}><span className="mr-2 font-mono text-xs text-tertiary">{time(cue.startSeconds)}–{time(cue.endSeconds)}</span>{cue.text}</p>)}
        </div> : null}
      </article>)}
    </section>
  </div>;
}
