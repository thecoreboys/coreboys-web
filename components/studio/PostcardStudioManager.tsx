"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultPostcardPackConfig,
  type PostcardStudioAction,
  type PostcardStudioDashboard,
  type PostcardStudioPack,
} from "@/lib/postcard-studio-schema";
import { PostcardPackConfigSchema } from "@/lib/postcard-pack-schema";

const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary outline-none transition focus:border-brand";
const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg border border-secondary bg-primary px-3 text-sm font-semibold text-secondary transition hover:border-brand-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-45";
const primaryButtonClass = "inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-solid px-4 text-sm font-semibold text-white transition hover:bg-brand-solid_hover disabled:cursor-not-allowed disabled:opacity-45";

type Props = {
  memberSlug: string;
  memberName: string;
  isAdmin: boolean;
};

function readableDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function actionLabel(pack: PostcardStudioPack): string {
  const revision = pack.latestRevision;
  if (!revision) return "No revision";
  return `v${revision.version} · ${revision.state}`;
}

export function PostcardStudioManager({ memberSlug, memberName, isAdmin }: Props) {
  const endpoint = `/api/studio/postcards?member=${encodeURIComponent(memberSlug)}`;
  const [dashboard, setDashboard] = useState<PostcardStudioDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  const [createTitle, setCreateTitle] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [packTitle, setPackTitle] = useState("");
  const [packDescription, setPackDescription] = useState("");
  const [configText, setConfigText] = useState("");
  const [reviewNote, setReviewNote] = useState("");

  const [dropPackId, setDropPackId] = useState("");
  const [dropCode, setDropCode] = useState("");
  const [dropTitle, setDropTitle] = useState("");
  const [dropDescription, setDropDescription] = useState("");
  const [dropStartsAt, setDropStartsAt] = useState("");
  const [dropEndsAt, setDropEndsAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin" });
      const json = await response.json().catch(() => ({})) as { dashboard?: PostcardStudioDashboard; error?: string };
      if (!response.ok || !json.dashboard) throw new Error(json.error ?? "Unable to load Postcard Studio.");
      setDashboard(json.dashboard);
      setSelectedPackId((current) => current && json.dashboard!.packs.some((pack) => pack.id === current)
        ? current
        : json.dashboard!.packs[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Postcard Studio.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!dashboard) return;
    setSelectedPackId((current) => current && dashboard.packs.some((pack) => pack.id === current)
      ? current
      : dashboard.packs[0]?.id ?? null);
  }, [dashboard]);

  const selectedPack = useMemo(
    () => dashboard?.packs.find((pack) => pack.id === selectedPackId) ?? null,
    [dashboard, selectedPackId],
  );
  const publishedPacks = useMemo(
    () => dashboard?.packs.filter((pack) => Boolean(pack.publishedRevisionId)) ?? [],
    [dashboard],
  );

  useEffect(() => {
    if (!selectedPack) return;
    setPackTitle(selectedPack.title);
    setPackDescription(selectedPack.description ?? "");
    setConfigText(JSON.stringify(
      selectedPack.latestRevision?.config ?? defaultPostcardPackConfig(selectedPack.title),
      null,
      2,
    ));
    setReviewNote(selectedPack.latestRevision?.reviewNote ?? "");
  }, [selectedPack]);

  useEffect(() => {
    if (publishedPacks.length === 0) {
      setDropPackId("");
      return;
    }
    setDropPackId((current) => publishedPacks.some((pack) => pack.id === current)
      ? current
      : publishedPacks[0]!.id);
  }, [publishedPacks]);

  async function mutate(action: PostcardStudioAction, success: string) {
    setBusy(action.action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const json = await response.json().catch(() => ({})) as { dashboard?: PostcardStudioDashboard; error?: string };
      if (!response.ok || !json.dashboard) throw new Error(json.error ?? "Unable to save this change.");
      setDashboard(json.dashboard);
      setNotice(success);
      return true;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Unable to save this change.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function createPack(event: React.FormEvent) {
    event.preventDefault();
    const title = createTitle.trim();
    if (!title) return;
    const created = await mutate({
      action: "create_pack",
      slug: createSlug.trim(),
      title,
      description: createDescription.trim() || null,
      config: defaultPostcardPackConfig(title),
    }, "Pack created with a private draft revision.");
    if (created) {
      setCreateTitle("");
      setCreateSlug("");
      setCreateDescription("");
    }
  }

  async function saveConfig() {
    if (!selectedPack) return;
    let value: unknown;
    try {
      value = JSON.parse(configText);
    } catch {
      setError("Pack settings must be valid JSON.");
      return;
    }
    const parsed = PostcardPackConfigSchema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`${issue?.path.join(".") || "Pack settings"}: ${issue?.message ?? "Invalid pack settings."}`);
      return;
    }
    await mutate({ action: "save_revision", packId: selectedPack.id, config: parsed.data }, "Draft revision saved.");
  }

  async function scheduleDrop(event: React.FormEvent) {
    event.preventDefault();
    const pack = publishedPacks.find((candidate) => candidate.id === dropPackId);
    if (!pack?.publishedRevisionId) return;
    const startsAt = new Date(dropStartsAt);
    const endsAt = dropEndsAt ? new Date(dropEndsAt) : null;
    if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) {
      setError("Choose a valid drop start and end time.");
      return;
    }
    const saved = await mutate({
      action: "schedule_drop",
      packId: pack.id,
      revisionId: pack.publishedRevisionId,
      code: dropCode.trim(),
      title: dropTitle.trim(),
      description: dropDescription.trim() || null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt?.toISOString() ?? null,
      albumCode: null,
    }, "Drop scheduled.");
    if (saved) {
      setDropCode("");
      setDropTitle("");
      setDropDescription("");
      setDropStartsAt("");
      setDropEndsAt("");
    }
  }

  if (loading) return <div className="h-96 animate-pulse rounded-2xl bg-primary ring-1 ring-inset ring-secondary" />;
  if (!dashboard) {
    return <div className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary"><p role="alert" className="text-sm text-error-primary">{error ?? "Postcard Studio is unavailable."}</p><button type="button" onClick={() => void load()} className={`${buttonClass} mt-4`}>Try again</button></div>;
  }

  const latest = selectedPack?.latestRevision ?? null;

  return (
    <div className="space-y-8">
      <p className="sr-only" aria-live="polite">{notice ?? error ?? ""}</p>
      {error ? <div role="alert" className="rounded-lg border border-error-primary/30 bg-error-primary/10 px-4 py-3 text-sm text-error-primary">{error}</div> : null}
      {notice ? <div role="status" className="rounded-lg border border-success-primary/30 bg-success-primary/10 px-4 py-3 text-sm text-success-primary">{notice}</div> : null}

      <section aria-labelledby="postcard-overview-heading" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <h2 id="postcard-overview-heading" className="sr-only">Postcard overview</h2>
        {[
          ["Packs", dashboard.packs.length],
          ["Started", dashboard.analytics.ordersStarted],
          ["Paid", dashboard.analytics.ordersPaid],
          ["Accepted", dashboard.analytics.ordersAccepted],
          ["Acknowledged", dashboard.analytics.ordersAcknowledged],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary">
            <p className="text-xs font-semibold uppercase tracking-wide text-quaternary">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-primary">{value}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="packs-heading" className="rounded-2xl bg-primary ring-1 ring-inset ring-secondary">
        <div className="border-b border-secondary p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-secondary">Creator design system</p>
          <h2 id="packs-heading" className="mt-1 text-2xl font-semibold text-primary">Design packs</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-tertiary">Build palettes, prompts, phrases, motifs, and templates. Drafts remain private until an admin reviews and publishes them.</p>
        </div>

        <div className="grid lg:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)]">
          <div className="border-b border-secondary p-5 lg:border-b-0 lg:border-r md:p-6">
            <form onSubmit={createPack} className="rounded-xl bg-secondary p-4 ring-1 ring-inset ring-secondary">
              <h3 className="text-sm font-semibold text-primary">New pack</h3>
              <label className="mt-3 block text-xs font-semibold text-tertiary">Title<input required maxLength={120} value={createTitle} onChange={(event) => {
                const value = event.target.value;
                setCreateTitle(value);
                setCreateSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80));
              }} className={inputClass} /></label>
              <label className="mt-3 block text-xs font-semibold text-tertiary">Code<input required pattern="[a-z][a-z0-9-]{0,79}" maxLength={80} value={createSlug} onChange={(event) => setCreateSlug(event.target.value.toLowerCase())} className={inputClass} /></label>
              <label className="mt-3 block text-xs font-semibold text-tertiary">Description<textarea rows={3} maxLength={1000} value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} className={inputClass} /></label>
              <button disabled={busy !== null} className={`${primaryButtonClass} mt-4 w-full`}>{busy === "create_pack" ? "Creating…" : "Create pack"}</button>
            </form>

            <div className="mt-5 space-y-2" role="group" aria-label={`${memberName} postcard packs`}>
              {dashboard.packs.length === 0 ? <p className="text-sm text-tertiary">No packs yet.</p> : dashboard.packs.map((pack) => (
                <button key={pack.id} type="button" onClick={() => setSelectedPackId(pack.id)} aria-pressed={pack.id === selectedPackId} className={`w-full rounded-xl border p-3 text-left transition ${pack.id === selectedPackId ? "border-brand-secondary bg-brand-primary/10" : "border-secondary bg-secondary hover:border-brand-secondary"}`}>
                  <span className="block text-sm font-semibold text-primary">{pack.title}</span>
                  <span className="mt-1 block text-xs text-tertiary">{actionLabel(pack)} · {pack.state}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0 p-5 md:p-6">
            {!selectedPack ? <p className="text-sm text-tertiary">Create a pack to start designing.</p> : (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-primary">{selectedPack.title}</h3>
                    <p className="mt-1 text-sm text-tertiary">{actionLabel(selectedPack)} · Updated {readableDate(selectedPack.updatedAt)}</p>
                  </div>
                  <span className="rounded-full border border-secondary px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-tertiary">{selectedPack.state}</span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-tertiary">Pack title<input maxLength={120} value={packTitle} onChange={(event) => setPackTitle(event.target.value)} className={inputClass} /></label>
                  <label className="text-xs font-semibold text-tertiary sm:col-span-2">Description<textarea rows={3} maxLength={1000} value={packDescription} onChange={(event) => setPackDescription(event.target.value)} className={inputClass} /></label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => void mutate({ action: "update_pack", packId: selectedPack.id, title: packTitle, description: packDescription.trim() || null }, "Pack details saved.")} className={buttonClass}>Save details</button>
                  {isAdmin && selectedPack.state !== "retired" ? (
                    <button type="button" disabled={busy !== null} onClick={() => {
                      if (!globalThis.confirm(`Retire ${selectedPack.title}? It will disappear from the fan editor and scheduled drops will be cancelled. This cannot be undone.`)) return;
                      void mutate({ action: "retire_pack", packId: selectedPack.id }, "Pack retired and scheduled drops cancelled.");
                    }} className={`${buttonClass} border-error-primary/40 text-error-primary hover:border-error-primary`}>Retire pack</button>
                  ) : null}
                </div>

                <div className="mt-7">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-primary">Pack settings</h4>
                      <p className="mt-1 text-xs text-tertiary">Strict data only—markup and unknown fields are rejected.</p>
                    </div>
                    <span className="text-xs text-quaternary">Maximum 256 KB</span>
                  </div>
                  <textarea aria-label="Pack settings JSON" spellCheck={false} rows={20} value={configText} onChange={(event) => setConfigText(event.target.value)} className={`${inputClass} resize-y font-mono text-xs leading-5`} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy !== null || latest?.state === "submitted" || latest?.state === "approved"} onClick={() => void saveConfig()} className={primaryButtonClass}>{busy === "save_revision" ? "Saving…" : "Save private draft"}</button>
                    {latest?.state === "draft" ? <button type="button" disabled={busy !== null} onClick={() => void mutate({ action: "submit_revision", revisionId: latest.id }, "Revision submitted for admin review.")} className={buttonClass}>Submit for review</button> : null}
                  </div>
                  {latest?.state === "submitted" ? <p className="mt-3 text-sm text-tertiary">This version is locked while an admin reviews it.</p> : null}
                  {latest?.state === "rejected" && latest.reviewNote ? <p className="mt-3 rounded-lg bg-secondary p-3 text-sm text-tertiary"><strong className="text-primary">Review note:</strong> {latest.reviewNote}</p> : null}
                </div>

                {isAdmin && latest && (latest.state === "submitted" || latest.state === "approved") ? (
                  <div className="mt-7 rounded-xl border border-brand-secondary/40 bg-brand-primary/10 p-4">
                    <h4 className="text-sm font-semibold text-primary">Admin review</h4>
                    <label className="mt-3 block text-xs font-semibold text-tertiary">Review note<textarea rows={3} maxLength={2000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className={inputClass} /></label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {latest.state === "submitted" ? <button type="button" disabled={busy !== null} onClick={() => void mutate({ action: "review_revision", revisionId: latest.id, decision: "approved", note: reviewNote.trim() || null }, "Revision approved. Publish when ready.")} className={primaryButtonClass}>Approve</button> : null}
                      {latest.state === "submitted" ? <button type="button" disabled={busy !== null || !reviewNote.trim()} onClick={() => void mutate({ action: "review_revision", revisionId: latest.id, decision: "rejected", note: reviewNote.trim() || null }, "Revision returned to the member.")} className={buttonClass}>Request changes</button> : null}
                      {latest.state === "approved" ? <button type="button" disabled={busy !== null} onClick={() => void mutate({ action: "publish_revision", revisionId: latest.id }, "Revision published.")} className={primaryButtonClass}>Publish pack</button> : null}
                    </div>
                  </div>
                ) : null}

                <div className="mt-7 rounded-xl border border-dashed border-secondary p-4">
                  <p className="text-sm font-semibold text-primary">Creator asset library</p>
                  <p className="mt-1 text-sm text-tertiary">The rights, quarantine, and approval model is ready. Binary upload stays staged until the project selects its permanent object-storage pipeline; approved asset IDs can already be referenced in pack settings.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="drops-heading" className="rounded-2xl bg-primary p-5 ring-1 ring-inset ring-secondary md:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-secondary">Seasonal releases</p>
        <h2 id="drops-heading" className="mt-1 text-2xl font-semibold text-primary">Drops</h2>
        <p className="mt-1 text-sm text-tertiary">Schedule a published revision. Cancelling a drop never deletes its history.</p>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <form onSubmit={scheduleDrop} className="rounded-xl bg-secondary p-4 ring-1 ring-inset ring-secondary">
            <h3 className="text-sm font-semibold text-primary">Schedule a drop</h3>
            {publishedPacks.length === 0 ? <p className="mt-3 text-sm text-tertiary">Publish a pack before scheduling its first drop.</p> : (
              <>
                <label className="mt-3 block text-xs font-semibold text-tertiary">Published pack<select required value={dropPackId} onChange={(event) => setDropPackId(event.target.value)} className={inputClass}>{publishedPacks.map((pack) => <option key={pack.id} value={pack.id}>{pack.title}</option>)}</select></label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-tertiary">Drop title<input required maxLength={120} value={dropTitle} onChange={(event) => setDropTitle(event.target.value)} className={inputClass} /></label>
                  <label className="text-xs font-semibold text-tertiary">Code<input required pattern="[a-z][a-z0-9-]{0,79}" maxLength={80} value={dropCode} onChange={(event) => setDropCode(event.target.value.toLowerCase())} className={inputClass} /></label>
                  <label className="text-xs font-semibold text-tertiary">Starts<input required type="datetime-local" value={dropStartsAt} onChange={(event) => setDropStartsAt(event.target.value)} className={inputClass} /></label>
                  <label className="text-xs font-semibold text-tertiary">Ends (optional)<input type="datetime-local" value={dropEndsAt} onChange={(event) => setDropEndsAt(event.target.value)} className={inputClass} /></label>
                  <label className="text-xs font-semibold text-tertiary sm:col-span-2">Description<textarea rows={3} maxLength={1000} value={dropDescription} onChange={(event) => setDropDescription(event.target.value)} className={inputClass} /></label>
                </div>
                <button disabled={busy !== null} className={`${primaryButtonClass} mt-4`}>{busy === "schedule_drop" ? "Scheduling…" : "Schedule drop"}</button>
              </>
            )}
          </form>

          <div>
            <h3 className="text-sm font-semibold text-primary">Release calendar</h3>
            <div className="mt-3 space-y-3">
              {dashboard.drops.length === 0 ? <p className="text-sm text-tertiary">No drops scheduled.</p> : dashboard.drops.map((drop) => (
                <article key={drop.id} className="rounded-xl border border-secondary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><h4 className="text-sm font-semibold text-primary">{drop.title}</h4><p className="mt-1 text-xs text-tertiary">{drop.packTitle} · v{drop.revisionVersion} · {drop.code}</p></div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-tertiary">{drop.state}</span>
                  </div>
                  <p className="mt-3 text-sm text-tertiary">{readableDate(drop.startsAt)}{drop.endsAt ? ` – ${readableDate(drop.endsAt)}` : ""}</p>
                  {drop.state === "scheduled" || drop.state === "draft" ? <button type="button" disabled={busy !== null} onClick={() => void mutate({ action: "cancel_drop", dropId: drop.id }, "Drop cancelled.")} className={`${buttonClass} mt-3`}>Cancel drop</button> : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="inbox-heading" className="rounded-2xl bg-primary p-5 ring-1 ring-inset ring-secondary md:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-secondary">Private to this community</p>
        <h2 id="inbox-heading" className="mt-1 text-2xl font-semibold text-primary">Postcard inbox</h2>
        <p className="mt-1 max-w-[72ch] text-sm text-tertiary">Only accepted, moderation-passed postcards appear here. Addresses, payment details, account identifiers, provider IDs, and printable artwork are never returned by this view.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dashboard.inbox.length === 0 ? <p className="text-sm text-tertiary">No delivered postcards yet.</p> : dashboard.inbox.map((item) => (
            <article key={item.id} className="rounded-xl border border-secondary bg-secondary p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-quaternary">{item.senderName ? `From ${item.senderName}` : "From a fan"}</p>
                <span className="text-xs text-quaternary">{readableDate(item.createdAt)}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-primary">{item.message}</p>
              <p className="mt-3 text-xs text-tertiary">{item.hasCustomArt ? "Includes custom art · artwork stays in the protected review pipeline" : "Standard design"}</p>
              <div className="mt-4 flex flex-wrap gap-2" aria-label="Acknowledge postcard">
                {(["heart", "thank_you", "seen"] as const).map((reaction) => (
                  <button key={reaction} type="button" disabled={busy !== null} aria-pressed={item.acknowledgement?.reaction === reaction} onClick={() => void mutate({ action: "acknowledge", orderId: item.id, reaction, visibleToSender: true }, reaction === "heart" ? "Heart sent." : reaction === "thank_you" ? "Thank-you acknowledgement sent." : "Postcard marked seen.")} className={`${buttonClass} ${item.acknowledgement?.reaction === reaction ? "border-brand-secondary text-primary" : ""}`}>
                    {reaction === "heart" ? "♥ Heart" : reaction === "thank_you" ? "Thank you" : "Seen"}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
