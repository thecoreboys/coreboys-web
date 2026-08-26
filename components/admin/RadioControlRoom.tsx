"use client";

import { useEffect, useMemo, useState } from "react";

type NetworkSlug = "core" | "adapt" | "ron" | "lacy" | "marlon" | "jason" | "silky";
type CueKind = "tune_in" | "live_takeover" | "intermission" | "outro";
type CueStatus = "draft" | "approved" | "archived";
type CueSource = "legacy" | "recorded" | "uploaded";

type Pool = {
  id: string;
  key: string;
  kind: CueKind;
  networkSlug: NetworkSlug | null;
  title: string;
  enabled: boolean;
  rotationMode: "shuffle" | "ordered";
};

type Asset = {
  id: string;
  poolKey: string;
  kind: CueKind;
  networkSlug: NetworkSlug | null;
  title: string;
  audioUrl: string | null;
  transcript: string | null;
  spokenTemplate: string | null;
  fallback: boolean;
  slug: string;
  status: CueStatus;
  enabled: boolean;
  source: CueSource;
  sourceLabel: string | null;
  durationMs: number | null;
  sortOrder: number;
};

type Snapshot = { pools: Pool[]; assets: Asset[] };

const EMPTY: Snapshot = { pools: [], assets: [] };
const NETWORKS: Array<{ value: NetworkSlug; label: string }> = [
  { value: "core", label: "CORE" }, { value: "adapt", label: "Flock / Adapt" },
  { value: "ron", label: "Stable / Ron" }, { value: "lacy", label: "Thugs / Lacy" },
  { value: "marlon", label: "M3 / Marlon" }, { value: "jason", label: "NMS / Jason" },
  { value: "silky", label: "SLG / Silky" },
];
const KINDS: Array<{ value: CueKind; label: string }> = [
  { value: "tune_in", label: "First tune-in" },
  { value: "live_takeover", label: "24/7 live takeover" },
  { value: "intermission", label: "Intermission" },
  { value: "outro", label: "Ending" },
];

const inputClass = "h-11 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const cardClass = "rounded-xl border border-secondary bg-primary p-5 shadow-xs";
const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-solid px-4 text-sm font-semibold text-white transition hover:bg-brand-solid_hover disabled:cursor-not-allowed disabled:opacity-50";

function poolKey(kind: CueKind, network: NetworkSlug) {
  return `${kind.replace(/_/g, "-")}:${network}`;
}

function slugify(value: string) {
  const next = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return next || `cora-cue-${Date.now()}`;
}

export function RadioControlRoom() {
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function request(method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/radio", {
        method,
        credentials: "same-origin",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(json.error || "Radio request failed");
      setData(json);
      setMessage(method === "GET" ? "" : "Saved");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Radio request failed");
      return false;
    } finally {
      setBusy(false); setLoading(false);
    }
  }

  useEffect(() => { void request("GET"); }, []);

  async function addAsset(form: HTMLFormElement) {
    const values = new FormData(form);
    const kind = values.get("kind") as CueKind;
    const networkSlug = values.get("networkSlug") as NetworkSlug;
    const title = String(values.get("title") || "").trim();
    const ok = await request("POST", {
      action: "create-asset",
      poolKey: poolKey(kind, networkSlug),
      slug: slugify(String(values.get("slug") || title)),
      title,
      audioUrl: String(values.get("audioUrl") || "").trim() || null,
      transcript: String(values.get("transcript") || "").trim() || null,
      spokenTemplate: String(values.get("spokenTemplate") || "").trim() || null,
      source: values.get("source"),
      sourceLabel: String(values.get("sourceLabel") || "").trim() || null,
      durationMs: values.get("durationMs") ? Number(values.get("durationMs")) : null,
      status: values.get("status"),
      enabled: true,
      fallback: false,
      sortOrder: 100,
    });
    if (ok) form.reset();
  }

  async function toggleAsset(asset: Asset) {
    await request("PATCH", {
      action: "update-asset",
      id: asset.id,
      poolKey: asset.poolKey,
      slug: asset.slug,
      title: asset.title,
      audioUrl: asset.audioUrl,
      transcript: asset.transcript,
      spokenTemplate: asset.spokenTemplate,
      source: asset.source,
      sourceLabel: asset.sourceLabel,
      durationMs: asset.durationMs,
      status: asset.status,
      enabled: !asset.enabled,
      fallback: asset.fallback,
      sortOrder: asset.sortOrder,
    });
  }

  const groups = useMemo(() => KINDS.map((kind) => ({
    ...kind,
    assets: data.assets.filter((asset) => asset.kind === kind.value),
  })), [data.assets]);

  if (loading) return <div className={cardClass}>Loading DJ Cora controls…</div>;

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-brand/30 bg-brand-primary_alt p-5 text-sm text-secondary">
        <p className="font-semibold text-primary">Saved recordings only</p>
        <p className="mt-1 max-w-3xl leading-relaxed">This control room never generates speech on page load or per listener. Add an already-rendered, approved recording once; the site rotates that saved asset for everyone. Drafts and disabled assets are never served publicly.</p>
      </section>

      {message ? <div role="status" className="rounded-lg border border-secondary bg-primary px-4 py-3 text-sm text-secondary">{message}</div> : null}

      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-primary">Add a saved Cora recording</h2>
        <p className="mt-1 text-sm text-tertiary">For a 24/7 takeover, record the generic line as one asset—e.g. “Hold up, hold up. Looks like the house has a new live room.”—then the player supplies the creator name visually. This keeps costs at zero per viewer.</p>
        <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void addAsset(event.currentTarget); }}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select className={inputClass} name="kind" defaultValue="tune_in" aria-label="Cue category">{KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select>
            <select className={inputClass} name="networkSlug" defaultValue="core" aria-label="Network">{NETWORKS.map((network) => <option key={network.value} value={network.value}>{network.label}</option>)}</select>
            <select className={inputClass} name="status" defaultValue="approved" aria-label="Review status"><option value="approved">Approved / ready</option><option value="draft">Draft (not public)</option></select>
            <select className={inputClass} name="source" defaultValue="uploaded" aria-label="Recording source"><option value="uploaded">Uploaded asset</option><option value="recorded">Studio recording</option></select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input className={inputClass} name="title" required placeholder="Display title — e.g. Hold up, new live room" />
            <input className={inputClass} name="slug" placeholder="Short slug (optional)" />
          </div>
          <input className={inputClass} name="audioUrl" required placeholder="/audio/dj-cora/hold-up-live-01.mp3 or https://approved-cdn/..." />
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <input className={inputClass} name="sourceLabel" placeholder="Recording source / note (optional)" />
            <input className={inputClass} name="durationMs" type="number" min="250" max="180000" placeholder="Duration ms" />
          </div>
          <textarea className="min-h-24 w-full rounded-lg border border-secondary bg-primary px-3 py-3 text-sm text-primary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20" name="transcript" placeholder="Transcript for captioning and review (optional)" />
          <textarea className="min-h-20 w-full rounded-lg border border-secondary bg-primary px-3 py-3 text-sm text-primary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20" name="spokenTemplate" placeholder="Optional approved script template; it is documentation only, never a runtime prompt" />
          <button className={buttonClass} disabled={busy}>Add saved recording</button>
        </form>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold text-primary">Cue catalog</h2><p className="mt-1 text-sm text-tertiary">{data.assets.filter((asset) => asset.status === "approved" && asset.enabled).length} active approved recordings across {data.pools.length} pools.</p></div></div>
        <div className="mt-4 grid gap-5 xl:grid-cols-2">
          {groups.map((group) => <div className={cardClass} key={group.value}>
            <h3 className="font-semibold text-primary">{group.label}</h3>
            <div className="mt-3 space-y-3">
              {group.assets.map((asset) => <article className="rounded-lg border border-secondary p-3" key={asset.id}>
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium text-primary">{asset.title}</p><p className="mt-1 text-xs text-tertiary">{asset.networkSlug ?? "All networks"} · {asset.status} · {asset.source}{asset.fallback ? " · fallback" : ""}</p>{asset.audioUrl ? <p className="mt-2 truncate text-xs text-brand-secondary">{asset.audioUrl}</p> : <p className="mt-2 text-xs text-warning-primary">No audio URL — never public</p>}</div><button type="button" className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${asset.enabled ? "border-success-primary/40 text-success-primary hover:bg-success-primary/10" : "border-secondary text-tertiary hover:bg-secondary"}`} disabled={busy || asset.status === "archived"} onClick={() => void toggleAsset(asset)}>{asset.enabled ? "Active" : "Disabled"}</button></div>
                {asset.transcript ? <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-tertiary">{asset.transcript}</p> : null}
              </article>)}
              {!group.assets.length ? <p className="text-sm text-tertiary">No saved recordings yet.</p> : null}
            </div>
          </div>)}
        </div>
      </section>
    </div>
  );
}
