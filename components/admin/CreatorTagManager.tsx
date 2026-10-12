"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { SocialPlatform, type CreatorAnnotation, type CreatorProfile } from "@/lib/creator-tags/model";
const endpoint = "/api/admin/media-intelligence/creators";
const field = "mt-1 min-h-11 w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-primary";
const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-secondary bg-primary px-4 text-sm font-semibold text-primary disabled:opacity-50";
type Dashboard = { creators: CreatorProfile[]; annotations: CreatorAnnotation[]; assets: Array<{ assetKey: string; title: string; duration: number | null; isLive: boolean; publishedAt: string | null }> };
const initial = { id: "", name: "", aliases: "", socials: "", active: true };
const stamp = (time: number) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`;

export function CreatorTagManager() {
  const [data, setData] = useState<Dashboard>({ creators: [], annotations: [], assets: [] });
  const [profile, setProfile] = useState(initial);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [assetKey, setAssetKey] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [start, setStart] = useState("0"), [end, setEnd] = useState("5");
  const [evidence, setEvidence] = useState("");
  const [placement, setPlacement] = useState("");
  const [editId, setEditId] = useState<string | undefined>();
  const [source, setSource] = useState(""), [sourceTitle, setSourceTitle] = useState("");
  const load = useCallback(async (query = "") => {
    const response = await fetch(`${endpoint}?${new URLSearchParams({ q: query })}`, { cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "Creator tags could not load.");
    setData(value);
  }, []);
  useEffect(() => { void load().catch((error) => setMessage(error.message)).finally(() => setLoading(false)); }, [load]);
  async function mutate(body: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Change could not be saved.");
      await load(search); setMessage("Saved."); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Change could not be saved."); return false; }
    finally { setBusy(false); }
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    const socials = profile.socials.split(/\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [platform, ...rest] = line.split(/\s+/); return { platform, url: rest.join(" ") };
    });
    if (await mutate({ action: "creator", creator: { ...profile, aliases: profile.aliases.split(",").map((value) => value.trim()).filter(Boolean), socials } })) setProfile(initial);
  }
  async function saveAnnotation(event: FormEvent) {
    event.preventDefault();
    const coordinates = placement.trim().split(/[,\s]+/).map(Number);
    if (placement && (coordinates.length !== 4 || !coordinates.every(Number.isFinite))) { setMessage("Enter four percentages: left, top, width, height."); return; }
    const box = placement ? { x: coordinates[0]! / 100, y: coordinates[1]! / 100, width: coordinates[2]! / 100, height: coordinates[3]! / 100 } : null;
    const source = data.assets.find((asset) => asset.assetKey === assetKey);
    if (await mutate({ action: "annotation", editId, annotation: { assetKey, creatorId, startSeconds: Number(start), endSeconds: Number(end), box,
      liveStartedAt: source?.isLive ? source.publishedAt ?? undefined : undefined, evidenceKind: "manual", evidence } })) { setEvidence(""); setEditId(undefined); }
  }
  const drafts = data.annotations.filter((tag) => tag.status === "draft");
  return <section className="space-y-8" aria-labelledby="creator-manager-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="creator-manager-heading" className="text-xl font-semibold text-primary">Creator tags</h2><p className="mt-2 max-w-2xl text-sm text-tertiary">Maintain verified social profiles and publish tags for specific moments. Names found in captions or titles enter the review queue.</p></div><button type="button" className={button} disabled={busy} onClick={() => void mutate({ action: "scan" })}>Find text mentions</button></div>
    <p className="text-sm text-tertiary">Included with CORE Membership. Text matching and reviewed tags use no paid image analysis.</p>
    {message ? <p role="status" className="rounded-lg border border-secondary bg-primary p-3 text-sm text-primary">{message}</p> : null}
    {loading ? <p role="status" className="text-sm text-tertiary">Loading creator tags…</p> : null}
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <form className="space-y-4 rounded-xl border border-secondary bg-primary p-5" onSubmit={(event) => void saveProfile(event)}>
        <h3 className="font-semibold text-primary">{profile.id ? "Edit creator profile" : "Add creator profile"}</h3>
        <label className="block text-sm text-secondary">Directory ID<input className={field} required value={profile.id} onChange={(event) => setProfile({ ...profile, id: event.target.value })} placeholder="creator-name" pattern="[a-z0-9][a-z0-9-]{1,79}" /></label>
        <label className="block text-sm text-secondary">Display name<input className={field} required value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} maxLength={100} /></label>
        <label className="block text-sm text-secondary">Names and usernames, separated by commas<input className={field} value={profile.aliases} onChange={(event) => setProfile({ ...profile, aliases: event.target.value })} placeholder="creatorname, @creatorname" /></label>
        <label className="block text-sm text-secondary">Verified social profiles<textarea className={`${field} min-h-32`} required value={profile.socials} onChange={(event) => setProfile({ ...profile, socials: event.target.value })} placeholder={"twitch https://www.twitch.tv/creatorname\nx https://x.com/creatorname"} /></label>
        <p className="text-xs text-tertiary">One platform and profile URL per line. Supported: {SocialPlatform.options.join(", ")}. Confirm account ownership before saving.</p>
        <label className="flex items-center gap-2 text-sm text-secondary"><input type="checkbox" checked={profile.active} onChange={(event) => setProfile({ ...profile, active: event.target.checked })} /> Available in creator search</label>
        <div className="flex gap-2"><button className={button} disabled={busy}>Save creator</button><button type="button" className={button} onClick={() => setProfile(initial)}>Clear</button></div>
      </form>
      <div className="space-y-4">
        <form className="space-y-3 rounded-xl border border-secondary bg-primary p-5" onSubmit={(event) => { event.preventDefault(); void load(search).catch((error) => setMessage(error.message)); }}>
          <h3 className="font-semibold text-primary">Find a video or stream</h3><label className="block text-sm text-secondary">Title or source ID<input className={field} value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} /></label><button className={button}>Search sources</button>
        </form>
        <form className="space-y-3 rounded-xl border border-secondary bg-primary p-5" onSubmit={(event) => void saveAnnotation(event)}>
          <h3 className="font-semibold text-primary">{editId ? "Edit timed tag" : "Create a timed tag"}</h3>
          <label className="block text-sm text-secondary">Source<select className={field} required value={assetKey} onChange={(event) => setAssetKey(event.target.value)}><option value="">Choose a source</option>{data.assets.map((asset) => <option value={asset.assetKey} key={asset.assetKey}>{asset.isLive ? "Live · " : ""}{asset.title}</option>)}</select></label>
          <label className="block text-sm text-secondary">Creator<select className={field} required value={creatorId} onChange={(event) => setCreatorId(event.target.value)}><option value="">Choose a creator</option>{data.creators.filter((creator) => creator.active).map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm text-secondary">Start, seconds<input className={field} type="number" step="0.1" min="0" required value={start} onChange={(event) => setStart(event.target.value)} /></label><label className="text-sm text-secondary">End, seconds<input className={field} type="number" step="0.1" min="0" required value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>
          <label className="block text-sm text-secondary">Placement, percentages (optional)<input className={field} value={placement} onChange={(event) => setPlacement(event.target.value)} placeholder="left, top, width, height · e.g. 20, 30, 10, 15" /></label>
          <label className="block text-sm text-secondary">Evidence or editorial note<textarea className={field} required minLength={3} maxLength={1000} value={evidence} onChange={(event) => setEvidence(event.target.value)} /></label>
          <button className={button} disabled={busy}>{editId ? "Save changes as draft" : "Save draft tag"}</button>
          {editId ? <button className={`${button} ml-2`} type="button" onClick={() => { setEditId(undefined); setEvidence(""); }}>Cancel edit</button> : null}
        </form>
        <form className="space-y-3 rounded-xl border border-secondary bg-primary p-5" onSubmit={(event) => { event.preventDefault(); void mutate({ action: "source", url: source, title: sourceTitle }); }}>
          <h3 className="font-semibold text-primary">Add a source for tagging</h3>
          <label className="block text-sm text-secondary">YouTube or Twitch URL<input className={field} type="url" required value={source} onChange={(event) => setSource(event.target.value)} /></label>
          <label className="block text-sm text-secondary">Video or stream title<input className={field} required value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} maxLength={200} /></label>
          <button className={button} disabled={busy}>Index source metadata</button>
        </form>
      </div>
    </div>
    <div><h3 className="mb-3 font-semibold text-primary">Creator directory</h3><div className="flex flex-wrap gap-2">{data.creators.map((creator) => <button key={creator.id} type="button" className={button} onClick={() => setProfile({ id: creator.id, name: creator.name, aliases: creator.aliases.join(", "), socials: creator.socials.map((social) => `${social.platform} ${social.url}`).join("\n"), active: creator.active })}>{creator.name}{creator.active ? "" : " · Hidden"}</button>)}</div></div>
    <section className="space-y-3"><h3 className="font-semibold text-primary">Review queue · {drafts.length} drafts</h3>
      {!drafts.length ? <p className="text-sm text-tertiary">No draft tags to review.</p> : null}
      {data.annotations.map((tag) => <article key={tag.id} className="space-y-3 rounded-xl border border-secondary bg-primary p-5">
        <div className="flex flex-wrap justify-between gap-2"><strong className="text-primary">{data.creators.find((creator) => creator.id === tag.creatorId)?.name ?? tag.creatorId} · {stamp(tag.startSeconds)}–{stamp(tag.endSeconds)}</strong><span className="text-sm text-secondary">{tag.status}{tag.current ? "" : " · Source changed"}</span></div>
        <p className="break-all text-xs text-tertiary">{tag.assetKey} · {tag.evidenceKind} · {tag.box ? "Positioned tag" : "Video tag"}</p><p className="text-sm text-secondary">{tag.evidence}</p>
        <p className="text-xs text-tertiary">Confirm this creator’s appearance at this moment before publishing. A caption mention alone does not confirm appearance.</p>
        <div className="flex flex-wrap gap-2">{tag.status === "draft" ? <><button type="button" className={button} disabled={busy || !tag.current} onClick={() => void mutate({ action: "publish", id: tag.id })}>Publish verified tag</button><button type="button" className={button} disabled={busy} onClick={() => void mutate({ action: "reject", id: tag.id })}>Reject</button></> : <button type="button" className={button} disabled={busy} onClick={() => void mutate({ action: "revoke", id: tag.id })}>Unpublish</button>}
          <button type="button" className={button} onClick={() => { setEditId(tag.id); setAssetKey(tag.assetKey); setCreatorId(tag.creatorId); setStart(String(tag.startSeconds)); setEnd(String(tag.endSeconds)); setEvidence(tag.evidence); setPlacement(tag.box ? [tag.box.x, tag.box.y, tag.box.width, tag.box.height].map((value) => Math.round(value * 1000) / 10).join(", ") : ""); }}>Edit tag</button>
        </div>
      </article>)}
    </section>
  </section>;
}
