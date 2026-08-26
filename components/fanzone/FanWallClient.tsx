"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera01, Image03, Plus } from "@untitledui/icons";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flag,
  Heart,
  History,
  MapPin,
  Palette,
  Share2,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FAN_RECEIPTS_KEY,
  FanPhotoSubmit,
  type FanSubmissionReceipt,
} from "@/components/fanzone/FanPhotoSubmit";
import { useAuth } from "@/components/providers/AuthProvider";
import { cx } from "@/utils/cx";

type MemberOption = {
  slug: string;
  stageName: string;
  accent: string;
  avatarUrl?: string;
};

type PublicFanPhoto = {
  id: string;
  imageUrl: string;
  thumbUrl: string;
  caption: string | null;
  story: string | null;
  kind: "photo" | "art";
  memberSlugs: string[];
  eventName: string | null;
  happenedOn: string | null;
  locationLabel: string | null;
  photographerCredit: string | null;
  submittedBy: string;
  createdAt: string;
  featured: boolean;
  reactions: number;
  reacted: boolean;
};

type SubmissionStatus = {
  id: string;
  kind: "photo" | "art";
  caption: string | null;
  eventName: string | null;
  status: "pending" | "approved" | "denied";
  denialReason: string | null;
  memberSlugs: string[];
  submittedAt: string;
  updatedAt: string;
  approvedAt: string | null;
  imageUrl: string | null;
};

export function FanWallClient({ memberOptions }: { memberOptions: MemberOption[] }) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<PublicFanPhoto[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | "photo" | "art">("all");
  const [member, setMember] = useState("");
  const [event, setEvent] = useState("");
  const [sort, setSort] = useState<"featured" | "newest" | "loved">("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selected, setSelected] = useState<PublicFanPhoto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (kind !== "all") params.set("kind", kind);
    if (member) params.set("member", member);
    if (event) params.set("event", event);
    params.set("sort", sort);
    try {
      const response = await fetch(`/api/fanzone/photos?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("The wall is temporarily unavailable.");
      const data = (await response.json()) as {
        photos?: PublicFanPhoto[];
        facets?: { events?: string[] };
      };
      setPhotos(data.photos ?? []);
      setEvents(data.facets?.events ?? []);
    } catch (caught) {
      setPhotos([]);
      setError(caught instanceof Error ? caught.message : "The wall is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [event, kind, member, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("photo");
    if (!id || selected) return;
    const local = photos.find((photo) => photo.id === id);
    if (local) {
      setSelected(local);
      return;
    }
    void fetch(`/api/fanzone/photos/${encodeURIComponent(id)}`, { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { photo?: PublicFanPhoto } | null) => {
        if (data?.photo) setSelected(data.photo);
      });
  }, [photos, selected]);

  function openPhoto(photo: PublicFanPhoto) {
    setSelected(photo);
    const url = new URL(window.location.href);
    url.searchParams.set("photo", photo.id);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams}${url.hash || "#wall"}`);
  }

  function closePhoto() {
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("photo");
    const query = url.searchParams.toString();
    window.history.replaceState(null, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash || "#wall"}`);
  }

  const activeFilters = Number(Boolean(member)) + Number(Boolean(event)) + Number(sort !== "featured");

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          <FeaturedIcon icon={Camera01} size="lg" color="brand" theme="modern" />
          <div>
            <p className="text-sm font-semibold text-brand-secondary">Community wall</p>
            <h2 className="mt-1 text-display-xs font-semibold tracking-tight text-primary md:text-display-sm">
              Your moments. <span className="gradient-text">Your art.</span>
            </h2>
            <p className="mt-2 max-w-[54ch] text-sm leading-relaxed text-tertiary">
              Approved community uploads, credited with first name and last initial.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="md" color="secondary" iconLeading={History} onClick={() => setHistoryOpen(true)}>
            My submissions
          </Button>
          <Button size="md" color="primary" iconLeading={Plus} onClick={() => setSubmitOpen(true)}>
            Share something
          </Button>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-secondary pb-4">
        <div className="inline-flex rounded-xl bg-secondary p-1" aria-label="Wall type">
          <Tab active={kind === "all"} onClick={() => setKind("all")}>All</Tab>
          <Tab active={kind === "photo"} onClick={() => setKind("photo")}>Photos</Tab>
          <Tab active={kind === "art"} onClick={() => setKind("art")}><Palette size={14} /> Art</Tab>
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((value) => !value)}
          aria-expanded={filtersOpen}
          className={cx(
            "ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
            filtersOpen || activeFilters > 0
              ? "border-brand bg-brand-primary text-primary"
              : "border-secondary bg-secondary text-tertiary hover:text-primary",
          )}
        >
          <SlidersHorizontal size={15} /> Filter
          {activeFilters > 0 ? <span className="grid size-5 place-items-center rounded-full bg-brand-solid text-[11px] text-white">{activeFilters}</span> : null}
        </button>
      </div>

      {filtersOpen ? (
        <div className="mb-6 grid gap-3 rounded-2xl border border-secondary bg-secondary p-4 sm:grid-cols-3">
          <FilterSelect label="Member" value={member} onChange={setMember}>
            <option value="">Everyone</option>
            {memberOptions.map((option) => <option key={option.slug} value={option.slug}>{option.stageName}</option>)}
          </FilterSelect>
          <FilterSelect label="Album" value={event} onChange={setEvent}>
            <option value="">Every album</option>
            {events.map((value) => <option key={value} value={value}>{value}</option>)}
          </FilterSelect>
          <FilterSelect label="Order" value={sort} onChange={(value) => setSort(value as typeof sort)}>
            <option value="featured">Featured first</option>
            <option value="newest">Newest</option>
            <option value="loved">Most COREs</option>
          </FilterSelect>
          {activeFilters > 0 ? (
            <button type="button" onClick={() => { setMember(""); setEvent(""); setSort("featured"); }} className="justify-self-start text-sm font-semibold text-brand-secondary sm:col-span-3">
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <WallSkeleton />
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-secondary bg-secondary p-8 text-center">
          <p className="font-semibold text-primary">Couldn’t load the wall</p>
          <p className="mt-1 text-sm text-tertiary">{error}</p>
          <Button size="md" color="secondary" onClick={() => void load()} className="mt-4">Try again</Button>
        </div>
      ) : photos.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-secondary bg-secondary p-10 text-center">
          <FeaturedIcon icon={kind === "art" ? Palette : Image03} size="xl" color="gray" theme="modern" />
          <p className="mt-4 text-lg font-semibold text-primary">Nothing here yet</p>
          <p className="mt-1 max-w-[46ch] text-sm text-tertiary">
            {activeFilters > 0 ? "Try clearing a filter." : "Be the first to share something for the team to review."}
          </p>
          {activeFilters === 0 ? <Button size="md" color="primary" onClick={() => setSubmitOpen(true)} className="mt-5">Share something</Button> : null}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => openPhoto(photo)}
                className="group relative block aspect-[4/5] w-full overflow-hidden rounded-xl border border-secondary bg-secondary text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-label={`Open ${photo.kind === "art" ? "artwork" : "photo"} by ${photo.submittedBy}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.thumbUrl} alt={photo.caption ?? `${photo.kind === "art" ? "Artwork" : "Photo"} shared by ${photo.submittedBy}`} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.025]" />
                <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                {photo.featured ? <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-black">Featured</span> : null}
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 text-white">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{photo.caption || photo.submittedBy}</span>
                    {photo.caption ? <span className="mt-0.5 block truncate text-[11px] text-white/70">{photo.submittedBy}</span> : null}
                  </span>
                  {photo.reactions > 0 ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold"><Heart size={12} fill="currentColor" /> {photo.reactions}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="w-[min(720px,94vw)] max-h-[92vh] overflow-hidden p-0">
          <DialogTitle className="sr-only">Share with the FanZone wall</DialogTitle>
          <DialogDescription className="sr-only">Upload a fan photo or artwork for review.</DialogDescription>
          <FanPhotoSubmit memberOptions={memberOptions} onClose={() => setSubmitOpen(false)} />
        </DialogContent>
      </Dialog>

      <SubmissionHistory open={historyOpen} onOpenChange={setHistoryOpen} signedIn={Boolean(user)} />

      <PhotoLightbox
        photo={selected}
        photos={photos}
        memberOptions={memberOptions}
        signedIn={Boolean(user)}
        onClose={closePhoto}
        onSelect={openPhoto}
        onReact={(id, reacted, reactions) => {
          setPhotos((current) => current.map((photo) => photo.id === id ? { ...photo, reacted, reactions } : photo));
          setSelected((current) => current?.id === id ? { ...current, reacted, reactions } : current);
        }}
      />
    </>
  );
}

function PhotoLightbox({
  photo,
  photos,
  memberOptions,
  signedIn,
  onClose,
  onSelect,
  onReact,
}: {
  photo: PublicFanPhoto | null;
  photos: PublicFanPhoto[];
  memberOptions: MemberOption[];
  signedIn: boolean;
  onClose: () => void;
  onSelect: (photo: PublicFanPhoto) => void;
  onReact: (id: string, reacted: boolean, reactions: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const index = photo ? photos.findIndex((item) => item.id === photo.id) : -1;

  useEffect(() => {
    if (!photo) return;
    function keydown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" && index > 0) onSelect(photos[index - 1]!);
      if (event.key === "ArrowRight" && index >= 0 && index < photos.length - 1) onSelect(photos[index + 1]!);
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [index, onSelect, photo, photos]);

  async function react() {
    if (!photo || busy) return;
    if (!signedIn) {
      setNotice("Sign in to leave a CORE.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/fanzone/photos/${photo.id}/reaction`, { method: "POST", credentials: "same-origin" });
      const data = (await response.json()) as { reacted?: boolean; reactions?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn’t save that.");
      onReact(photo.id, Boolean(data.reacted), Number(data.reactions ?? 0));
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Couldn’t save that.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!photo) return;
    const url = `${window.location.origin}/fanzone?photo=${photo.id}#wall`;
    if (navigator.share) {
      await navigator.share({ title: photo.caption ?? "CORE FanZone", url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const memberNames = photo?.memberSlugs
    .map((slug) => memberOptions.find((member) => member.slug === slug)?.stageName)
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <Dialog open={Boolean(photo)} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="w-[min(1120px,96vw)] max-h-[92vh] overflow-hidden p-0">
          <DialogTitle className="sr-only">{photo?.caption ?? `Wall post by ${photo?.submittedBy ?? "community member"}`}</DialogTitle>
          <DialogDescription className="sr-only">FanZone wall post details.</DialogDescription>
          {photo ? (
            <div className="grid max-h-[92vh] min-h-[520px] md:grid-cols-[minmax(0,1fr)_340px]">
              <div className="relative grid min-h-[360px] place-items-center overflow-hidden bg-black p-3 md:min-h-[640px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.imageUrl} alt={photo.caption ?? `${photo.kind === "art" ? "Artwork" : "Photo"} shared by ${photo.submittedBy}`} className="max-h-[84vh] max-w-full object-contain" />
                {index > 0 ? <NavButton label="Previous" side="left" onClick={() => onSelect(photos[index - 1]!)}><ArrowLeft size={18} /></NavButton> : null}
                {index >= 0 && index < photos.length - 1 ? <NavButton label="Next" side="right" onClick={() => onSelect(photos[index + 1]!)}><ArrowRight size={18} /></NavButton> : null}
              </div>
              <aside className="overflow-y-auto bg-primary p-5 pt-14 md:p-6 md:pt-14">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-tertiary">
                    {photo.kind === "art" ? <Palette size={13} /> : <Camera01 className="size-3.5" />}
                    {photo.kind === "art" ? "Fan art" : "Fan photo"}
                  </span>
                  <span className="text-xs text-quaternary">{formatDate(photo.happenedOn ?? photo.createdAt)}</span>
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight text-primary">{photo.caption || "From the community"}</h3>
                <p className="mt-2 text-sm text-tertiary">Shared by {photo.submittedBy}</p>
                {photo.story ? <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{photo.story}</p> : null}
                <dl className="mt-6 space-y-3 border-t border-secondary pt-5 text-sm">
                  {photo.eventName ? <Meta label="Album" value={photo.eventName} /> : null}
                  {memberNames ? <Meta label="With / for" value={memberNames} /> : null}
                  {photo.locationLabel ? <Meta label="Location" value={photo.locationLabel} icon={<MapPin size={14} />} /> : null}
                  {photo.photographerCredit ? <Meta label={photo.kind === "art" ? "Artist" : "Credit"} value={photo.photographerCredit} /> : null}
                </dl>
                <div className="mt-7 grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy} onClick={() => void react()} aria-pressed={photo.reacted} className={cx(actionClass, photo.reacted && "border-brand bg-brand-primary text-brand-secondary")}>
                    <Heart size={16} fill={photo.reacted ? "currentColor" : "none"} /> {photo.reactions || "CORE"}
                  </button>
                  <button type="button" onClick={() => void share()} className={actionClass}>
                    {copied ? <Check size={16} /> : <Share2 size={16} />} {copied ? "Copied" : "Share"}
                  </button>
                </div>
                {notice ? <p role="status" className="mt-3 text-xs font-medium text-brand-secondary">{notice}</p> : null}
                <button type="button" onClick={() => signedIn ? setReportOpen(true) : setNotice("Sign in to report a wall post.")} className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-quaternary hover:text-secondary">
                  <Flag size={13} /> Report or request removal
                </button>
              </aside>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {photo ? <ReportDialog photoId={photo.id} open={reportOpen} onOpenChange={setReportOpen} /> : null}
    </>
  );
}

function ReportDialog({ photoId, open, onOpenChange }: { photoId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = useState("privacy");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/fanzone/photos/${photoId}/report`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, details }),
      });
      if (!response.ok) throw new Error("Couldn’t submit the report.");
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t submit the report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[500px] p-6">
        <DialogTitle className="text-2xl">Report this post</DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-relaxed">The review team will see this privately. For urgent safety issues, email press@thecoreboys.com.</DialogDescription>
        {done ? (
          <div className="mt-6 rounded-xl border border-success_subtle bg-success-primary p-4 text-sm font-medium text-success-primary">Report received. Thank you.</div>
        ) : (
          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-secondary">Reason
              <select value={reason} onChange={(event) => setReason(event.target.value)} className={cx(nativeSelectClass, "mt-1.5")}>
                <option value="privacy">Privacy / removal request</option>
                <option value="copyright">Copyright or ownership</option>
                <option value="unsafe">Unsafe or inappropriate</option>
                <option value="spam">Spam or impersonation</option>
                <option value="other">Something else</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-secondary">Details <span className="font-normal text-quaternary">(optional)</span>
              <textarea value={details} onChange={(event) => setDetails(event.target.value.slice(0, 500))} rows={4} className={cx(nativeSelectClass, "mt-1.5 resize-y py-2.5")} />
            </label>
            {error ? <p role="alert" className="text-sm text-error-primary">{error}</p> : null}
            <Button size="md" color="primary" isLoading={busy} isDisabled={busy} onClick={() => void send()}>Submit report</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SubmissionHistory({ open, onOpenChange, signedIn }: { open: boolean; onOpenChange: (open: boolean) => void; signedIn: boolean }) {
  const [items, setItems] = useState<SubmissionStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let receipts: FanSubmissionReceipt[] = [];
    try {
      receipts = JSON.parse(localStorage.getItem(FAN_RECEIPTS_KEY) ?? "[]") as FanSubmissionReceipt[];
    } catch {
      receipts = [];
    }
    setItems(null);
    setError(null);
    void fetch("/api/fanzone/submissions", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ receipts }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Couldn’t check your submissions.");
        return response.json() as Promise<{ submissions?: SubmissionStatus[] }>;
      })
      .then((data) => setItems(data.submissions ?? []))
      .catch((caught) => {
        setItems([]);
        setError(caught instanceof Error ? caught.message : "Couldn’t check your submissions.");
      });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[680px] p-6 md:p-8">
        <DialogTitle className="text-2xl">My submissions</DialogTitle>
        <DialogDescription className="mt-2 text-sm">{signedIn ? "Everything sent from this account or browser." : "Submissions remembered on this browser. Sign in to keep history across devices."}</DialogDescription>
        <div className="mt-6 max-h-[58vh] overflow-y-auto">
          {items === null ? <div className="h-36 animate-pulse rounded-xl bg-secondary" /> : error ? <p role="alert" className="text-sm text-error-primary">{error}</p> : items.length === 0 ? (
            <div className="rounded-xl border border-secondary bg-secondary p-8 text-center"><p className="font-semibold text-primary">No submissions yet</p><p className="mt-1 text-sm text-tertiary">Anything you share from this browser will show here.</p></div>
          ) : (
            <ul className="divide-y divide-[color:var(--color-border-secondary)]">
              {items.map((item) => (
                <li key={item.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                  {item.imageUrl ? (
                    <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageUrl} alt="" className="size-full object-cover" />
                    </div>
                  ) : (
                    <div className="grid size-16 shrink-0 place-items-center rounded-lg bg-secondary text-quaternary">
                      {item.kind === "art" ? <Palette size={20} /> : <Image03 className="size-5" />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><StatusPill status={item.status} /><span className="text-xs text-quaternary">{formatDate(item.submittedAt)}</span></div>
                    <p className="mt-1 truncate text-sm font-semibold text-primary">{item.caption || item.eventName || (item.kind === "art" ? "Fan art" : "Fan photo")}</p>
                    {item.status === "pending" ? <p className="mt-1 text-xs text-tertiary">Private · waiting for a team review</p> : null}
                    {item.status === "denied" ? <p className="mt-1 text-xs text-tertiary">{item.denialReason || "This one wasn’t a fit for the public wall."}</p> : null}
                    {item.status === "approved" ? <a href={`/fanzone?photo=${item.id}#wall`} className="mt-1 inline-block text-xs font-semibold text-brand-secondary">View on wall</a> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusPill({ status }: { status: SubmissionStatus["status"] }) {
  const classes = status === "approved" ? "bg-success-primary text-success-primary" : status === "denied" ? "bg-secondary text-tertiary" : "bg-warning-primary text-warning-primary";
  return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", classes)}>{status}</span>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={cx("inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand", active ? "bg-primary text-primary shadow-xs ring-1 ring-inset ring-secondary" : "text-tertiary hover:text-primary")}>{children}</button>;
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-quaternary">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className={nativeSelectClass}>{children}</select></label>;
}

const nativeSelectClass = "min-h-10 w-full rounded-lg border border-secondary bg-primary px-3 text-sm text-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand";
const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-secondary bg-secondary px-3 text-sm font-semibold text-secondary transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

function NavButton({ label, side, onClick, children }: { label: string; side: "left" | "right"; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} onClick={onClick} className={cx("absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white", side === "left" ? "left-3" : "right-3")}>{children}</button>;
}

function Meta({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="grid grid-cols-[86px_1fr] gap-3"><dt className="text-tertiary">{label}</dt><dd className="inline-flex items-start gap-1.5 font-medium text-secondary">{icon}{value}</dd></div>;
}

function WallSkeleton() {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Loading wall">{Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-xl bg-secondary" />)}</div>;
}

function formatDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
