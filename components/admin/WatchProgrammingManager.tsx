"use client";

import { useEffect, useState } from "react";

type NetworkSlug = "core" | "adapt" | "ron" | "lacy" | "marlon" | "jason" | "silky";
type RouteMode = "videos" | "shorts" | "continuous";
type Route = { networkSlug: NetworkSlug; channelMode: RouteMode };
type Section = { id: string; slug: string; title: string; kicker: string | null; layout: "standard" | "vertical" | "auto"; enabled: boolean; sortOrder: number };
type Source = { id: string; name: string; platform: "youtube" | "tiktok" | "instagram" | "x"; sourceRef: string; sourceUrl: string | null; enabled: boolean; routes: Route[]; sectionIds: string[] };
type Item = { id: string; sourceId: string | null; platform: "youtube" | "tiktok" | "instagram"; sourceUrl: string; title: string; subtitle: string | null; posterUrl: string | null; format: "auto" | "long" | "short"; enabled: boolean; heroFeatured: boolean; heroPriority: number; sectionIds: string[] };
type Snapshot = { sources: Source[]; items: Item[]; sections: Section[] };

const NETWORKS: Array<{ slug: NetworkSlug; label: string }> = [
  { slug: "core", label: "CORE" }, { slug: "adapt", label: "Adapt" },
  { slug: "ron", label: "Ron" }, { slug: "lacy", label: "Lacy" },
  { slug: "marlon", label: "Marlon" }, { slug: "jason", label: "Jason" },
  { slug: "silky", label: "Silky" },
];
const MODES: Array<{ mode: RouteMode; label: string }> = [
  { mode: "videos", label: "Videos" }, { mode: "shorts", label: "Shorts" },
  { mode: "continuous", label: "24/7" },
];
const EMPTY: Snapshot = { sources: [], items: [], sections: [] };

function routeKey(route: Route) { return `${route.networkSlug}:${route.channelMode}`; }
function sectionIds(form: FormData) { return form.getAll("sectionIds").map(String); }
function routes(form: FormData): Route[] {
  return form.getAll("routes").map(String).flatMap((value) => {
    const [networkSlug, channelMode] = value.split(":") as [NetworkSlug, RouteMode];
    return NETWORKS.some((network) => network.slug === networkSlug) && MODES.some((mode) => mode.mode === channelMode)
      ? [{ networkSlug, channelMode }] : [];
  });
}

const inputClass = "h-11 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const cardClass = "rounded-xl border border-secondary bg-primary p-5 shadow-xs";
const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-solid px-4 text-sm font-semibold text-white transition hover:bg-brand-solid_hover disabled:cursor-not-allowed disabled:opacity-50";

export function WatchProgrammingManager() {
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function request(method: string, body?: unknown, query = "") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/programming${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: "same-origin",
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Request failed");
      setData(json as Snapshot);
      setMessage("Saved");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
      return false;
    } finally { setBusy(false); setLoading(false); }
  }

  useEffect(() => { void request("GET"); }, []);

  async function createSection(form: HTMLFormElement) {
    const values = new FormData(form);
    const ok = await request("POST", {
      entity: "section", title: values.get("title"), kicker: values.get("kicker") || null,
      layout: values.get("layout"), sortOrder: Number(values.get("sortOrder") || 100), enabled: true,
    });
    if (ok) form.reset();
  }

  async function createSource(form: HTMLFormElement) {
    const values = new FormData(form);
    const ok = await request("POST", {
      entity: "source", name: values.get("name"), platform: values.get("platform"),
      sourceRef: values.get("sourceRef"), sourceUrl: values.get("sourceUrl") || null,
      enabled: true, routes: routes(values), sectionIds: sectionIds(values),
    });
    if (ok) form.reset();
  }

  async function createItem(form: HTMLFormElement) {
    const values = new FormData(form);
    const ok = await request("POST", {
      entity: "item", url: values.get("url"), title: values.get("title") || undefined,
      sourceId: values.get("sourceId") || null, format: values.get("format"),
      heroFeatured: values.get("heroFeatured") === "on",
      heroPriority: Number(values.get("heroPriority") || 100), enabled: true,
      sectionIds: sectionIds(values),
    });
    if (ok) form.reset();
  }

  async function remove(entity: "source" | "item" | "section", id: string, label: string) {
    if (!window.confirm(`Remove ${label}?`)) return;
    await request("DELETE", undefined, `?entity=${entity}&id=${encodeURIComponent(id)}`);
  }

  if (loading) return <div className={cardClass}>Loading programming controls…</div>;

  return (
    <div className="space-y-8">
      {message ? <div role="status" className="rounded-lg border border-secondary bg-primary px-4 py-3 text-sm text-secondary">{message}</div> : null}

      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-primary">1. Create a homepage section</h2>
        <p className="mt-1 text-sm text-tertiary">Make a named rail—such as “From the community”—then attach entire creator feeds or hand-picked videos.</p>
        <form className="mt-5 grid gap-3 md:grid-cols-[1.3fr_1.3fr_.7fr_.5fr_auto]" onSubmit={(event) => { event.preventDefault(); void createSection(event.currentTarget); }}>
          <input className={inputClass} name="title" required placeholder="Community discoveries" />
          <input className={inputClass} name="kicker" placeholder="Channels worth watching" />
          <select className={inputClass} name="layout" defaultValue="auto"><option value="auto">Auto detect</option><option value="standard">Landscape</option><option value="vertical">Vertical</option></select>
          <input className={inputClass} name="sortOrder" type="number" min="0" defaultValue="100" aria-label="Section order" />
          <button className={buttonClass} disabled={busy}>Create</button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-primary">2. Add a community channel</h2>
        <p className="mt-1 text-sm text-tertiary">Feature YouTube, TikTok, Instagram, or X creators in any home rail. A public TikTok handle can fall back to TikTok&apos;s official Creator Profile Embed with up to 10 recent videos; a public Instagram handle can use Meta&apos;s official profile embed.</p>
        <form className="mt-5 space-y-5" onSubmit={(event) => { event.preventDefault(); void createSource(event.currentTarget); }}>
          <div className="grid gap-3 md:grid-cols-4">
            <input className={inputClass} name="name" required placeholder="Display name" />
            <select className={inputClass} name="platform" defaultValue="youtube"><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="x">X</option></select>
            <input className={inputClass} name="sourceRef" required placeholder="@handle, channel URL, or UC id" />
            <input className={inputClass} name="sourceUrl" type="url" placeholder="Public profile URL (optional)" />
          </div>
          <RouteMatrix />
          <SectionChecks sections={data.sections} />
          <button className={buttonClass} disabled={busy}>Add channel</button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-primary">3. Curate public social media</h2>
        <p className="mt-1 text-sm text-tertiary">Paste a YouTube video or Short, TikTok, Instagram Reel, or Instagram post URL. Official public embeds work without creator login. Instagram profile embeds are a front-end view, not feed discovery, so add known public post or Reel URLs to render individual posts. Creator alerts use CORE&apos;s public-feed monitor when available.</p>
        <form className="mt-5 space-y-5" onSubmit={(event) => { event.preventDefault(); void createItem(event.currentTarget); }}>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <input className={inputClass} name="url" type="url" required placeholder="YouTube, TikTok, or Instagram URL" />
            <input className={inputClass} name="title" placeholder="Override title (optional)" />
            <select className={inputClass} name="sourceId" defaultValue=""><option value="">No linked community source</option>{data.sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
            <select className={inputClass} name="format" defaultValue="auto"><option value="auto">Detect format</option><option value="long">Long video</option><option value="short">Short / vertical</option></select>
          </div>
          <SectionChecks sections={data.sections} />
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-secondary"><input name="heroFeatured" type="checkbox" className="size-4 accent-[color:var(--brand-600)]" /> Place in home hero</label>
            <label className="inline-flex items-center gap-2 text-sm text-tertiary">Hero order <input className="h-9 w-24 rounded-md border border-secondary bg-primary px-2 text-primary" name="heroPriority" type="number" min="0" defaultValue="100" /></label>
            <button className={buttonClass} disabled={busy}>Add video</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-primary">Home hero queue</h2>
        <p className="mt-1 text-sm text-tertiary">Featured items are shown in ascending order. Live programming and a viewer’s optional Continue Watching item follow this editorial queue.</p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {data.items.filter((item) => item.heroFeatured).sort((a, b) => a.heroPriority - b.heroPriority).map((item) => <ItemCard key={item.id} item={item} sources={data.sources} sections={data.sections} busy={busy} save={request} remove={remove} />)}
          {!data.items.some((item) => item.heroFeatured) ? <p className="text-sm text-tertiary">No editorial hero items yet. Enable “Place in home hero” on a curated video.</p> : null}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-primary">Community channels</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {data.sources.map((source) => <SourceCard key={source.id} source={source} sections={data.sections} busy={busy} save={request} remove={remove} />)}
          {!data.sources.length ? <p className="text-sm text-tertiary">No community channels yet.</p> : null}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-primary">Curated videos</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {data.items.map((item) => <ItemCard key={item.id} item={item} sources={data.sources} sections={data.sections} busy={busy} save={request} remove={remove} />)}
          {!data.items.length ? <p className="text-sm text-tertiary">No curated videos yet.</p> : null}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-primary">Homepage sections</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {data.sections.map((section) => <SectionCard key={section.id} section={section} busy={busy} save={request} remove={remove} />)}
        </div>
      </section>
    </div>
  );
}

function RouteMatrix({ selected = [] }: { selected?: Route[] }) {
  const keys = new Set(selected.map(routeKey));
  return <fieldset><legend className="text-sm font-semibold text-secondary">Mix this source into specific network channels</legend><div className="mt-2 overflow-x-auto rounded-lg border border-secondary"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b border-secondary text-left text-tertiary"><th className="px-3 py-2">Network</th>{MODES.map(({ mode, label }) => <th className="px-3 py-2" key={mode}>{label}</th>)}</tr></thead><tbody>{NETWORKS.map((network) => <tr className="border-b border-secondary last:border-0" key={network.slug}><th className="px-3 py-2 text-left font-medium text-primary">{network.label}</th>{MODES.map(({ mode }) => { const value = `${network.slug}:${mode}`; return <td className="px-3 py-2" key={mode}><input aria-label={`${network.label} ${mode}`} className="size-4 accent-[color:var(--brand-600)]" name="routes" type="checkbox" value={value} defaultChecked={keys.has(value)} /></td>; })}</tr>)}</tbody></table></div></fieldset>;
}

function SectionChecks({ sections, selected = [] }: { sections: Section[]; selected?: string[] }) {
  return <fieldset><legend className="text-sm font-semibold text-secondary">Homepage sections</legend><div className="mt-2 flex flex-wrap gap-3">{sections.map((section) => <label key={section.id} className="inline-flex items-center gap-2 rounded-lg border border-secondary px-3 py-2 text-sm text-secondary"><input name="sectionIds" type="checkbox" value={section.id} defaultChecked={selected.includes(section.id)} className="size-4 accent-[color:var(--brand-600)]" />{section.title}</label>)}{!sections.length ? <span className="text-sm text-tertiary">Create a section first.</span> : null}</div></fieldset>;
}

function SourceCard({ source, sections, busy, save, remove }: { source: Source; sections: Section[]; busy: boolean; save: (method: string, body?: unknown) => Promise<boolean>; remove: (entity: "source", id: string, label: string) => Promise<void> }) {
  return <form className={cardClass} onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void save("PATCH", { entity: "source", id: source.id, name: values.get("name"), platform: values.get("platform"), sourceRef: values.get("sourceRef"), sourceUrl: values.get("sourceUrl") || null, enabled: values.get("enabled") === "on", routes: routes(values), sectionIds: sectionIds(values) }); }}><div className="grid gap-3 sm:grid-cols-2"><input className={inputClass} name="name" defaultValue={source.name} /><select className={inputClass} name="platform" defaultValue={source.platform}><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="x">X</option></select><input className={inputClass} name="sourceRef" defaultValue={source.sourceRef} /><input className={inputClass} name="sourceUrl" type="url" defaultValue={source.sourceUrl ?? ""} placeholder="Profile URL" /></div><div className="mt-4"><RouteMatrix selected={source.routes} /></div><div className="mt-4"><SectionChecks sections={sections} selected={source.sectionIds} /></div><div className="mt-4 flex items-center gap-3"><label className="inline-flex items-center gap-2 text-sm text-secondary"><input name="enabled" type="checkbox" defaultChecked={source.enabled} /> Enabled</label><button className={buttonClass} disabled={busy}>Save</button><button type="button" className="ml-auto text-sm font-semibold text-error-primary hover:underline" onClick={() => void remove("source", source.id, source.name)}>Delete</button></div></form>;
}

function ItemCard({ item, sources, sections, busy, save, remove }: { item: Item; sources: Source[]; sections: Section[]; busy: boolean; save: (method: string, body?: unknown) => Promise<boolean>; remove: (entity: "item", id: string, label: string) => Promise<void> }) {
  const fallbackPoster = item.platform === "youtube"
    ? `https://i.ytimg.com/vi/${item.sourceUrl.split("v=")[1]}/mqdefault.jpg`
    : "/embed-preview.png";
  return <form className={cardClass} onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void save("PATCH", { entity: "item", id: item.id, title: values.get("title"), subtitle: values.get("subtitle") || null, posterUrl: values.get("posterUrl") || null, sourceId: values.get("sourceId") || null, format: values.get("format"), enabled: values.get("enabled") === "on", heroFeatured: values.get("heroFeatured") === "on", heroPriority: Number(values.get("heroPriority") || 100), sectionIds: sectionIds(values) }); }}><div className="flex gap-4"><img src={item.posterUrl ?? fallbackPoster} alt="" className="h-24 w-40 rounded-lg object-cover" /><div className="min-w-0 flex-1"><input className={inputClass} name="title" defaultValue={item.title} /><a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs text-brand-secondary hover:underline">{item.sourceUrl}</a></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><input className={inputClass} name="subtitle" defaultValue={item.subtitle ?? ""} placeholder="Subtitle" /><input className={inputClass} name="posterUrl" type="url" defaultValue={item.posterUrl ?? ""} placeholder="Poster override" /><select className={inputClass} name="sourceId" defaultValue={item.sourceId ?? ""}><option value="">No source</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select><select className={inputClass} name="format" defaultValue={item.format}><option value="auto">Detect</option><option value="long">Long</option><option value="short">Short</option></select></div><div className="mt-4"><SectionChecks sections={sections} selected={item.sectionIds} /></div><div className="mt-4 flex flex-wrap items-center gap-3"><label className="inline-flex items-center gap-2 text-sm text-secondary"><input name="enabled" type="checkbox" defaultChecked={item.enabled} /> Enabled</label><label className="inline-flex items-center gap-2 text-sm text-secondary"><input name="heroFeatured" type="checkbox" defaultChecked={item.heroFeatured} /> Main hero</label><input className="h-9 w-20 rounded-md border border-secondary bg-primary px-2 text-sm text-primary" name="heroPriority" type="number" min="0" defaultValue={item.heroPriority} aria-label="Hero order" /><button className={buttonClass} disabled={busy}>Save</button><button type="button" className="ml-auto text-sm font-semibold text-error-primary hover:underline" onClick={() => void remove("item", item.id, item.title)}>Delete</button></div></form>;
}

function SectionCard({ section, busy, save, remove }: { section: Section; busy: boolean; save: (method: string, body?: unknown) => Promise<boolean>; remove: (entity: "section", id: string, label: string) => Promise<void> }) {
  return <form className={cardClass} onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void save("PATCH", { entity: "section", id: section.id, slug: values.get("slug"), title: values.get("title"), kicker: values.get("kicker") || null, layout: values.get("layout"), enabled: values.get("enabled") === "on", sortOrder: Number(values.get("sortOrder") || 100) }); }}><div className="space-y-3"><input className={inputClass} name="title" defaultValue={section.title} /><input className={inputClass} name="slug" defaultValue={section.slug} /><input className={inputClass} name="kicker" defaultValue={section.kicker ?? ""} placeholder="Kicker" /><div className="grid grid-cols-2 gap-3"><select className={inputClass} name="layout" defaultValue={section.layout}><option value="auto">Auto detect</option><option value="standard">Landscape</option><option value="vertical">Vertical</option></select><input className={inputClass} name="sortOrder" type="number" min="0" defaultValue={section.sortOrder} /></div></div><div className="mt-4 flex items-center gap-3"><label className="inline-flex items-center gap-2 text-sm text-secondary"><input name="enabled" type="checkbox" defaultChecked={section.enabled} /> Enabled</label><button className={buttonClass} disabled={busy}>Save</button><button type="button" className="ml-auto text-sm font-semibold text-error-primary hover:underline" onClick={() => void remove("section", section.id, section.title)}>Delete</button></div></form>;
}
