"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, Plus, Save, Eye, Pencil, RefreshCw } from "lucide-react";
import { CampaignShowcase } from "@/components/campaigns/CampaignSection";
import { campaignState, formatCampaignMoney } from "@/lib/campaigns/schedule";
import { campaignImageSchema, campaignInputSchema } from "@/lib/campaigns/validation";
import { CAMPAIGN_PLATFORMS, type Campaign, type CampaignInput, type PublicCampaign } from "@/lib/campaigns/types";
import styles from "./CampaignManager.module.css";

const blank = (): CampaignInput => ({
  title: "", subject: "", summary: "", campaignUrl: "", imageUrl: "", logoUrl: null,
  rewardType: "cpm", budgetCents: 100_000, rateCents: 100, platforms: ["tiktok", "instagram", "youtube"],
  campaignStartsAt: null, campaignEndsAt: null, displayStartsAt: null, displayEndsAt: null,
  placements: ["home", "clips"], status: "draft", sortOrder: 100,
});
const inputOnly = ({ id: _id, revision: _revision, updatedAt: _updatedAt, ...input }: Campaign): CampaignInput => input;
const localDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const isoDate = (value: string) => value ? new Date(value).toISOString() : null;
const moneyValue = (cents: number | null) => cents === null ? "" : String(cents / 100);
const platformNames = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", x: "X" };

function Field({ label, children, help, error, wide = false }: { label: string; children: ReactNode; help?: string; error?: string; wide?: boolean }) {
  return <label className={`${styles.field} ${wide ? styles.wide : ""}`}><span>{label}</span>{children}{error ? <small className={styles.fieldError}>{error}</small> : help ? <small>{help}</small> : null}</label>;
}

export function CampaignManager({ initialCampaigns }: { initialCampaigns?: Campaign[] }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns ?? []);
  const [loading, setLoading] = useState(!initialCampaigns);
  const [selected, setSelected] = useState<Campaign | null>(initialCampaigns?.[0] ?? null);
  const [draft, setDraft] = useState<CampaignInput>(initialCampaigns?.[0] ? inputOnly(initialCampaigns[0]) : blank);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reloadSuggested, setReloadSuggested] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const form = useRef<HTMLFormElement>(null);
  const editCache = useRef(new Map<string, CampaignInput>());
  const pendingEdits = selected ? JSON.stringify(draft) !== JSON.stringify(inputOnly(selected)) : JSON.stringify(draft) !== JSON.stringify(blank());
  const state = campaignState(draft, now);
  const set = <K extends keyof CampaignInput>(key: K, value: CampaignInput[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setIssues((current) => ({ ...current, [key]: "" }));
    setMessage("");
  };
  const choose = (campaign: Campaign | null) => {
    editCache.current.set(selected?.id ?? "new", draft);
    setSelected(campaign);
    setDraft(editCache.current.get(campaign?.id ?? "new") ?? (campaign ? inputOnly(campaign) : blank()));
    setIssues({}); setError(""); setReloadSuggested(false); setMessage(""); setTab("edit");
  };

  async function load(signal?: AbortSignal) {
    setLoading(true); setError(""); setReloadSuggested(false);
    try {
      const response = await fetch("/api/admin/campaigns", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Sign in with an admin account to manage campaigns." : data.error || "Campaigns could not be loaded.");
      editCache.current.clear();
      const first = data.campaigns[0] ?? null;
      setCampaigns(data.campaigns); setSelected(first); setDraft(first ? inputOnly(first) : blank());
      setIssues({}); setMessage(""); setTab("edit");
    } catch (failure) { if (!signal?.aborted) { setError(failure instanceof Error ? failure.message : "Campaigns could not be loaded."); setReloadSuggested(true); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => {
    if (initialCampaigns) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
    // Initial load only; choosing an ad never refetches or discards its editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!pendingEdits) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingEdits]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(""); setReloadSuggested(false); setMessage("");
    const result = campaignInputSchema.safeParse(draft);
    if (!result.success) {
      const fields = Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
      setIssues(fields); setError("Check the highlighted campaign details.");
      const first = String(result.error.issues[0]?.path[0] ?? "");
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus());
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/campaigns", {
        method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(selected ? { id: selected.id, revision: selected.revision } : {}), campaign: result.data }),
      });
      const data = await response.json();
      if (!response.ok) {
        setReloadSuggested(response.status === 409);
        if (data.issues) setIssues(Object.fromEntries(data.issues.map((issue: { field: string; message: string }) => [issue.field.replace(/^campaign\./, ""), issue.message])));
        throw new Error(data.error || "Campaign could not be saved.");
      }
      const saved = data.campaign as Campaign;
      editCache.current.delete(selected?.id ?? "new");
      setCampaigns((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.sortOrder - b.sortOrder));
      setSelected(saved); setDraft(inputOnly(saved)); setIssues({}); setNow(Date.now());
      setMessage(saved.status === "draft" ? "Draft saved. It is hidden from the website." : saved.status === "archived" ? "Campaign archived. It is hidden from the website." : "Campaign saved. Its display schedule is active.");
      // Other open public tabs refresh within a minute; exact expiry is also enforced in each card rail.
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Campaign could not be saved."); }
    finally { setSaving(false); }
  }

  const previewCampaign = { ...draft, id: selected?.id ?? "preview", imageUrl: campaignImageSchema.safeParse(draft.imageUrl).success ? draft.imageUrl : "/campaigns/clipping-studio.webp", logoUrl: draft.logoUrl && campaignImageSchema.safeParse(draft.logoUrl).success ? draft.logoUrl : null, title: draft.title || "Your next campaign", subject: draft.subject || "Creator", rateCents: draft.rateCents ?? 0 } as PublicCampaign;
  const counts = { live: campaigns.filter((item) => campaignState(item, now) === "live").length, scheduled: campaigns.filter((item) => campaignState(item, now) === "scheduled").length, drafts: campaigns.filter((item) => item.status === "draft").length };

  return <div className={styles.manager}>
    <div className={styles.toolbar}>
      <div className={styles.counts}><span><strong>{counts.live}</strong> live</span><span><strong>{counts.scheduled}</strong> scheduled</span><span><strong>{counts.drafts}</strong> drafts</span></div>
      <button className={styles.primaryButton} type="button" onClick={() => choose(null)} disabled={saving || loading}><Plus size={17} /> New campaign</button>
    </div>
    {error ? <div className={styles.error} role="alert">{error}{reloadSuggested ? <button type="button" onClick={() => { editCache.current.clear(); void load(); }} disabled={saving || loading}><RefreshCw size={14} /> Reload campaigns</button> : null}</div> : null}
    {message ? <p className={styles.success} role="status">{message}</p> : null}
    {loading ? <p className={styles.loading} role="status">Loading campaigns…</p> : <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Saved campaigns">
        <p className={styles.sidebarTitle}>Campaigns <span>{campaigns.length}</span></p>
        {campaigns.map((campaign) => <button type="button" key={campaign.id} className={styles.campaignOption} aria-pressed={selected?.id === campaign.id} onClick={() => choose(campaign)} disabled={saving}>
          <span className={styles.optionSubject}>{campaign.subject}<span className={styles.state} data-state={campaignState(campaign, now)}>{campaignState(campaign, now)}</span></span>
          <strong>{campaign.title}</strong><span>{formatCampaignMoney(campaign.budgetCents)} budget · {campaign.placements.map((placement) => placement === "home" ? "Home" : "Clips").join(" + ") || "No placements"}</span>
        </button>)}
        {!campaigns.length ? <p className={styles.empty}>Add your first campaign to start building the clipping room.</p> : null}
      </aside>
      <div className={styles.editor}>
        <div className={styles.editorHeading}><div><span className={styles.kicker}>{selected ? "Edit campaign" : "New campaign"}</span><h2>{draft.subject || "Your next campaign"}</h2></div><span className={styles.state} data-state={state}>{state}</span></div>
        <div className={styles.tabs} aria-label="Campaign editor view"><button type="button" aria-pressed={tab === "edit"} onClick={() => setTab("edit")}><Pencil size={15} /> Details</button><button type="button" aria-pressed={tab === "preview"} onClick={() => setTab("preview")}><Eye size={16} /> Preview</button>{pendingEdits ? <span>Unsaved changes</span> : null}</div>
        {tab === "preview" ? <div className={styles.preview}><p>This is an unpublished preview of your current edits.</p><CampaignShowcase campaigns={[previewCampaign]} preview /><button type="button" className={styles.secondaryButton} onClick={() => setTab("edit")}>Back to details</button></div> : <form onSubmit={save} ref={form} noValidate>
          <fieldset disabled={saving}>
            <legend>Campaign details</legend>
            <div className={styles.fields}>
              <Field label="Campaign link" wide error={issues.campaignUrl}><input name="campaignUrl" type="url" value={draft.campaignUrl} onChange={(event) => set("campaignUrl", event.target.value)} placeholder="https://contentrewards.com/c/campaigns/…" aria-invalid={!!issues.campaignUrl} /></Field>
              <Field label="Card title" error={issues.title}><input name="title" maxLength={70} value={draft.title} onChange={(event) => set("title", event.target.value)} aria-invalid={!!issues.title} /></Field>
              <Field label="Creator or brand" error={issues.subject}><input name="subject" maxLength={32} value={draft.subject} onChange={(event) => set("subject", event.target.value)} placeholder="CORE, Lacy, TapCap…" aria-invalid={!!issues.subject} /></Field>
              <Field label="Artwork" wide error={issues.imageUrl} help="Use the real creator, full CORE roster, or product artwork. Local image path or HTTPS URL."><input name="imageUrl" value={draft.imageUrl} onChange={(event) => set("imageUrl", event.target.value)} placeholder="/campaigns/your-artwork.webp" aria-invalid={!!issues.imageUrl} /></Field>
              <Field label="Community logo (optional)" wide error={issues.logoUrl}><input name="logoUrl" value={draft.logoUrl ?? ""} onChange={(event) => set("logoUrl", event.target.value || null)} placeholder="/comms/lacy.png" aria-invalid={!!issues.logoUrl} /></Field>
              <Field label="Reward type"><select name="rewardType" value={draft.rewardType} onChange={(event) => { const rewardType = event.target.value as CampaignInput["rewardType"]; setDraft((current) => ({ ...current, rewardType, rateCents: rewardType === "pool" ? null : current.rateCents ?? 100 })); }}><option value="cpm">Per 1,000 approved views</option><option value="pool">Shared reward pool</option></select></Field>
              <Field label="Total budget (USD)" error={issues.budgetCents}><input name="budgetCents" type="number" min="0.01" step="0.01" value={moneyValue(draft.budgetCents)} onChange={(event) => set("budgetCents", Math.round(Number(event.target.value) * 100))} aria-invalid={!!issues.budgetCents} /></Field>
              {draft.rewardType === "cpm" ? <Field label="Reward per 1K views (USD)" error={issues.rateCents}><input name="rateCents" type="number" min="0.01" step="0.01" value={moneyValue(draft.rateCents)} onChange={(event) => set("rateCents", Math.round(Number(event.target.value) * 100))} aria-invalid={!!issues.rateCents} /></Field> : null}
            </div>
            <div className={styles.checkGroup}><span>Platforms</span><div>{CAMPAIGN_PLATFORMS.map((platform) => <label key={platform}><input type="checkbox" name="platforms" value={platform} checked={draft.platforms.includes(platform)} onChange={(event) => set("platforms", event.target.checked ? [...draft.platforms, platform] : draft.platforms.filter((value) => value !== platform))} />{platformNames[platform]}</label>)}</div>{issues.platforms ? <small className={styles.fieldError}>{issues.platforms}</small> : null}</div>
          </fieldset>
          <fieldset disabled={saving}>
            <legend>Dates & visibility</legend>
            <p className={styles.helper}>Enter times in your timezone{typeof Intl !== "undefined" ? ` (${Intl.DateTimeFormat().resolvedOptions().timeZone})` : ""}. Public cards show dates in UTC.</p>
            <div className={styles.fields}>
              <Field label="Campaign launched (optional)" error={issues.campaignStartsAt}><input name="campaignStartsAt" type="datetime-local" value={localDate(draft.campaignStartsAt)} onChange={(event) => set("campaignStartsAt", isoDate(event.target.value))} aria-invalid={!!issues.campaignStartsAt} /></Field>
              <Field label="Campaign closes (if confirmed)" error={issues.campaignEndsAt} help="Leave blank if the organizer has not confirmed a closing time."><input name="campaignEndsAt" type="datetime-local" value={localDate(draft.campaignEndsAt)} onChange={(event) => set("campaignEndsAt", isoDate(event.target.value))} aria-invalid={!!issues.campaignEndsAt} /></Field>
              <Field label="Show ad from" error={issues.displayStartsAt}><input name="displayStartsAt" type="datetime-local" value={localDate(draft.displayStartsAt)} onChange={(event) => set("displayStartsAt", isoDate(event.target.value))} aria-invalid={!!issues.displayStartsAt} /></Field>
              <Field label="Stop showing ad at" error={issues.displayEndsAt} help="Required to publish. The ad disappears automatically at this time or the campaign close, whichever comes first."><input name="displayEndsAt" type="datetime-local" value={localDate(draft.displayEndsAt)} onChange={(event) => set("displayEndsAt", isoDate(event.target.value))} aria-invalid={!!issues.displayEndsAt} /></Field>
              <Field label="Status"><select name="status" value={draft.status} onChange={(event) => set("status", event.target.value as CampaignInput["status"])}><option value="draft">Draft — hidden</option><option value="published">Published — follow schedule</option><option value="archived">Archived — hidden</option></select></Field>
              <Field label="Display order" error={issues.sortOrder} help="Lower numbers appear first."><input name="sortOrder" type="number" min="0" max="9999" step="1" value={draft.sortOrder} onChange={(event) => set("sortOrder", Number(event.target.value))} aria-invalid={!!issues.sortOrder} /></Field>
            </div>
            <div className={styles.checkGroup}><span>Show on</span><div>{(["home", "clips"] as const).map((placement) => <label key={placement}><input type="checkbox" name="placements" checked={draft.placements.includes(placement)} onChange={(event) => set("placements", event.target.checked ? [...draft.placements, placement] : draft.placements.filter((value) => value !== placement))} />{placement === "home" ? "Home page" : "Clips page"}</label>)}</div>{issues.placements ? <small className={styles.fieldError}>{issues.placements}</small> : null}</div>
            {!draft.campaignEndsAt ? <p className={styles.notice}>The organizer’s closing date is unconfirmed. Choose a short display window, then review the campaign before extending it.</p> : null}
          </fieldset>
          <div className={styles.actions}><button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? <RefreshCw size={17} /> : <Save size={17} />}{saving ? "Saving…" : "Save campaign"}</button><button type="button" className={styles.secondaryButton} onClick={() => setTab("preview")} disabled={saving}><Eye size={17} /> Preview</button>{pendingEdits ? <button type="button" className={styles.secondaryButton} disabled={saving} onClick={() => { editCache.current.delete(selected?.id ?? "new"); setDraft(selected ? inputOnly(selected) : blank()); setIssues({}); setError(""); setMessage(""); }}>Reset changes</button> : null}{draft.campaignUrl.startsWith("https://contentrewards.com/c/campaigns/") ? <a href={draft.campaignUrl} target="_blank" rel="noopener noreferrer">Check source <ArrowUpRight size={15} /></a> : null}</div>
        </form>}
      </div>
    </div>}
  </div>;
}
