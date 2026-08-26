"use client";

import { useEffect, useRef, useState } from "react";
import { Trash01, UploadCloud02, RefreshCw01, Tag01, ImagePlus, AlertCircle } from "@untitledui/icons";
import { Button, styles as buttonStyles } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Badge } from "@/components/base/badges/badges";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { cx } from "@/utils/cx";

type Photo = {
  id: string;
  cdn_url: string;
  mime: string;
  width: number | null;
  height: number | null;
  taken_at: string | null;
  camera_make: string | null;
  camera_model: string | null;
  created_at: string;
  size_bytes: string;
  /** Member face tags make an uploaded photo available in that creator's gallery. */
  member_refs: string[];
};

type CreatorGallery = {
  slug: string;
  name: string;
  /** Existing member + group gallery the public profile falls back to. */
  fallbackPhotos: string[];
  /** Current public order: either the fallback or an explicit admin override. */
  photoUrls: string[];
  isCustomized: boolean;
};

export type PersonOption = {
  kind: "member" | "crew" | "talent";
  ref: string;
  name: string;
};

export type PhotoManagerProps = {
  /** Combined member + crew + talent options for the tag dropdown. */
  people: PersonOption[];
};

/**
 * Admin photo manager. Upload form posts a multipart/form-data to
 * /api/admin/photos which streams the bytes to DO Spaces, parses
 * EXIF, and inserts into media_assets. Below the form: a grid of every
 * uploaded asset with delete + manual face-tag controls.
 *
 * UUI controls: Button uploader, Badge metadata, FeaturedIcon empty
 * state, card surfaces, modal tag editor with UUI toggles.
 */
export function PhotoManager({ people }: PhotoManagerProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tagOpenId, setTagOpenId] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<PersonOption[]>([]);
  const [galleries, setGalleries] = useState<CreatorGallery[]>([]);
  const [galleriesLoading, setGalleriesLoading] = useState(true);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryOpenSlug, setGalleryOpenSlug] = useState<string | null>(null);
  const [galleryDraft, setGalleryDraft] = useState<string[]>([]);
  const [gallerySaving, setGallerySaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/photos", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { photos: Photo[] };
      setPhotos(json.photos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }

  async function loadGalleries() {
    setGalleriesLoading(true);
    setGalleryError(null);
    try {
      const res = await fetch("/api/admin/member-galleries", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { galleries: CreatorGallery[] };
      setGalleries(json.galleries);
    } catch (e) {
      setGalleryError(e instanceof Error ? e.message : "Could not load creator galleries.");
    } finally {
      setGalleriesLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void loadGalleries();
  }, []);

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    let succeeded = 0;
    let failed = 0;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/admin/photos", { method: "POST", body: fd });
        if (!res.ok) {
          const j: { error?: string; detail?: string } = await res.json().catch(() => ({}));
          throw new Error(j.detail ?? j.error ?? `HTTP ${res.status}`);
        }
        succeeded++;
      } catch (err) {
        failed++;
        if (!uploadError) {
          setUploadError(err instanceof Error ? err.message : "upload failed");
        }
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (succeeded > 0) void load();
    if (failed === 0) setUploadError(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this photo? This removes the asset row + the Spaces object.")) return;
    try {
      const res = await fetch(`/api/admin/photos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      void loadGalleries();
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function openTagEditor(id: string) {
    setTagOpenId(id);
    setActiveTags([]);
    try {
      const res = await fetch(`/api/admin/photos/${id}/tags`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        tags: Array<{ personKind: "member" | "crew" | "talent"; personRef: string }>;
      };
      const matched: PersonOption[] = [];
      for (const t of json.tags) {
        const p = people.find((x) => x.kind === t.personKind && x.ref === t.personRef);
        if (p) matched.push(p);
      }
      setActiveTags(matched);
    } catch {
      /* ignore */
    }
  }

  async function saveTags() {
    if (!tagOpenId) return;
    try {
      const res = await fetch(`/api/admin/photos/${tagOpenId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tags: activeTags.map((t) => ({ personKind: t.kind, personRef: t.ref })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTagOpenId(null);
      setActiveTags([]);
      // Refresh member tags so the upload immediately becomes available in
      // the matching creator's gallery curator.
      void load();
    } catch (e) {
      alert(`Save tags failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  function toggleTag(p: PersonOption) {
    setActiveTags((prev) =>
      prev.some((x) => x.kind === p.kind && x.ref === p.ref)
        ? prev.filter((x) => !(x.kind === p.kind && x.ref === p.ref))
        : [...prev, p],
    );
  }

  function openGalleryEditor(gallery: CreatorGallery) {
    setGalleryOpenSlug(gallery.slug);
    setGalleryDraft(gallery.photoUrls);
    setGalleryError(null);
  }

  function toggleGalleryPhoto(photoUrl: string) {
    setGalleryDraft((current) =>
      current.includes(photoUrl)
        ? current.filter((url) => url !== photoUrl)
        : [...current, photoUrl],
    );
  }

  function moveGalleryPhoto(index: number, direction: -1 | 1) {
    setGalleryDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const photoUrl = next[index];
      const adjacent = next[nextIndex];
      if (!photoUrl || !adjacent) return current;
      next[index] = adjacent;
      next[nextIndex] = photoUrl;
      return next;
    });
  }

  async function saveGallery() {
    if (!galleryOpenSlug) return;
    setGallerySaving(true);
    setGalleryError(null);
    try {
      const res = await fetch(`/api/admin/member-galleries/${encodeURIComponent(galleryOpenSlug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrls: galleryDraft }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setGalleries((current) => current.map((gallery) =>
        gallery.slug === galleryOpenSlug
          ? { ...gallery, photoUrls: galleryDraft, isCustomized: true }
          : gallery,
      ));
      setGalleryOpenSlug(null);
      setGalleryDraft([]);
    } catch (e) {
      setGalleryError(e instanceof Error ? e.message : "Could not save this gallery.");
    } finally {
      setGallerySaving(false);
    }
  }

  async function restoreDefaultGallery() {
    if (!galleryOpenSlug) return;
    setGallerySaving(true);
    setGalleryError(null);
    try {
      const res = await fetch(`/api/admin/member-galleries/${encodeURIComponent(galleryOpenSlug)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const restored = galleries.find((gallery) => gallery.slug === galleryOpenSlug)?.fallbackPhotos ?? [];
      setGalleryDraft(restored);
      setGalleries((current) => current.map((gallery) =>
        gallery.slug === galleryOpenSlug
          ? { ...gallery, photoUrls: gallery.fallbackPhotos, isCustomized: false }
          : gallery,
      ));
    } catch (e) {
      setGalleryError(e instanceof Error ? e.message : "Could not restore the default gallery.");
    } finally {
      setGallerySaving(false);
    }
  }

  const openedGallery = galleryOpenSlug
    ? galleries.find((gallery) => gallery.slug === galleryOpenSlug) ?? null
    : null;
  const galleryCandidates = openedGallery
    ? uniquePhotoUrls([
        ...openedGallery.fallbackPhotos,
        ...openedGallery.photoUrls,
        ...photos
          .filter((photo) => photo.member_refs.includes(openedGallery.slug))
          .map((photo) => photo.cdn_url),
      ])
    : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Uploader */}
      <section className="rounded-xl bg-secondary p-6 ring-1 ring-inset ring-secondary shadow-xs">
        <div className="flex items-start gap-4">
          <FeaturedIcon icon={UploadCloud02} size="lg" color="brand" theme="modern" />
          <div className="min-w-0 flex-1">
            <h3 className="text-md font-semibold text-primary">Upload photos</h3>
            <p className="mt-1 text-sm text-tertiary">
              JPEG / PNG / WebP / HEIC / AVIF. EXIF is parsed automatically; bytes stream to DO
              Spaces and a row lands in <code className="font-mono">media_assets</code>.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label
                className={cx(
                  buttonStyles.common.root,
                  buttonStyles.sizes.md.root,
                  buttonStyles.colors.primary.root,
                  "cursor-pointer",
                )}
              >
                <ImagePlus data-icon className="size-5" />
                {uploading ? "Uploading…" : "Choose files"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"
                  multiple
                  onChange={onFileSelected}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
            {uploadError ? (
              <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-error-primary px-3 py-2.5 ring-1 ring-inset ring-error_subtle">
                <AlertCircle className="size-4 shrink-0 text-fg-error-secondary" />
                <p className="text-sm font-medium text-primary">{uploadError}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Public creator gallery curation. The default catalog is the existing
          /about gallery; admin uploads join it after they are tagged. */}
      <section className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary shadow-xs md:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-primary">Creator galleries</h3>
            <p className="mt-1 max-w-2xl text-sm text-tertiary">
              Choose the photos and order shown on each creator&apos;s About and Network pages.
              Until you save a gallery, it keeps the current member-and-group photo selection.
            </p>
          </div>
          <Button
            size="sm"
            color="secondary"
            iconLeading={RefreshCw01}
            onClick={() => void loadGalleries()}
          >
            Refresh
          </Button>
        </header>

        {galleryError ? (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-error-primary px-3.5 py-3 ring-1 ring-inset ring-error_subtle">
            <AlertCircle className="size-4 shrink-0 text-fg-error-secondary" />
            <p className="text-sm font-medium text-primary">{galleryError}</p>
          </div>
        ) : null}

        {galleriesLoading ? (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-xl bg-secondary ring-1 ring-inset ring-secondary" />
            ))}
          </div>
        ) : (
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {galleries.map((gallery) => (
              <li key={gallery.slug} className="flex min-h-24 items-center gap-3 rounded-xl bg-secondary p-3 ring-1 ring-inset ring-secondary">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-primary">
                  {gallery.photoUrls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={gallery.photoUrls[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-quaternary">—</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-primary">{gallery.name}</p>
                    <Badge type="pill-color" size="sm" color={gallery.isCustomized ? "brand" : "gray"}>
                      {gallery.isCustomized ? "Curated" : "Default"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-tertiary">{gallery.photoUrls.length} visible photos</p>
                  <Button size="sm" color="secondary" className="mt-2" onClick={() => openGalleryEditor(gallery)}>
                    Curate gallery
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Gallery */}
      <section>
        <header className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold tracking-tight text-primary">
            Admin uploads · {photos.length}
          </h3>
          <Button size="sm" color="secondary" iconLeading={RefreshCw01} onClick={() => void load()}>
            Refresh
          </Button>
        </header>

        {error ? (
          <div className="flex items-center gap-2.5 rounded-lg bg-error-primary px-3.5 py-3 ring-1 ring-inset ring-error_subtle">
            <AlertCircle className="size-4 shrink-0 text-fg-error-secondary" />
            <p className="text-sm font-medium text-primary">{error}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] animate-pulse rounded-xl bg-secondary ring-1 ring-inset ring-secondary"
              />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl bg-secondary p-10 text-center ring-1 ring-inset ring-secondary shadow-xs">
            <FeaturedIcon icon={ImagePlus} size="xl" color="gray" theme="modern" />
            <p className="mt-4 text-md font-semibold text-primary">No admin uploads yet</p>
            <p className="mt-1 text-sm text-tertiary">Drop a photo in the uploader above.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {photos.map((p) => (
              <li
                key={p.id}
                className="overflow-hidden rounded-xl bg-primary ring-1 ring-inset ring-secondary shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative aspect-square bg-secondary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.cdn_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-col gap-1.5 p-3">
                  <p className="font-mono text-xs tabular-nums text-tertiary">
                    {p.width && p.height ? `${p.width}×${p.height}` : "—"}
                    {p.taken_at
                      ? ` · ${new Date(p.taken_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}`
                      : ""}
                  </p>
                  {p.camera_make ? (
                    <p className="truncate font-mono text-xs text-quaternary">
                      {p.camera_make} {p.camera_model ?? ""}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      color="secondary"
                      iconLeading={Tag01}
                      onClick={() => openTagEditor(p.id)}
                      className="flex-1"
                    >
                      Tag
                    </Button>
                    <ButtonUtility
                      size="sm"
                      color="tertiary"
                      tooltip="Delete"
                      icon={Trash01}
                      onClick={() => remove(p.id)}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tag dialog */}
      {tagOpenId ? (
        <div
          role="dialog"
          aria-label="Tag people"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setTagOpenId(null)}
        >
          <div
            className="w-full max-w-[520px] rounded-2xl bg-primary p-6 ring-1 ring-inset ring-secondary shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <FeaturedIcon icon={Tag01} size="md" color="brand" theme="modern" />
              <div>
                <h4 className="text-md font-semibold text-primary">Manual face tags</h4>
                <p className="mt-1 text-sm text-tertiary">
                  No AI — just check who&apos;s in the photo. Saves to{" "}
                  <code className="font-mono">media_face_tags</code>.
                </p>
              </div>
            </div>
            <ul className="mt-5 flex max-h-[55vh] flex-col gap-1.5 overflow-y-auto">
              {people.map((p) => {
                const active = activeTags.some((x) => x.kind === p.kind && x.ref === p.ref);
                return (
                  <li key={`${p.kind}:${p.ref}`}>
                    <button
                      type="button"
                      onClick={() => toggleTag(p)}
                      aria-pressed={active}
                      className={cx(
                        "flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium ring-1 ring-inset transition-colors",
                        active
                          ? "bg-brand-primary text-brand-secondary ring-brand"
                          : "bg-secondary text-secondary ring-secondary hover:text-primary",
                      )}
                    >
                      <span>{p.name}</span>
                      <Badge type="pill-color" size="sm" color={active ? "brand" : "gray"}>
                        {p.kind}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 flex items-center justify-end gap-3 border-t border-secondary pt-4">
              <Button color="link-gray" size="md" onClick={() => setTagOpenId(null)}>
                Cancel
              </Button>
              <Button color="primary" size="md" onClick={saveTags}>
                Save tags
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {openedGallery ? (
        <GalleryCuratorDialog
          gallery={openedGallery}
          candidates={galleryCandidates}
          draft={galleryDraft}
          saving={gallerySaving}
          onClose={() => {
            setGalleryOpenSlug(null);
            setGalleryDraft([]);
          }}
          onToggle={toggleGalleryPhoto}
          onMove={moveGalleryPhoto}
          onRestore={() => void restoreDefaultGallery()}
          onSave={() => void saveGallery()}
        />
      ) : null}
    </div>
  );
}

function GalleryCuratorDialog({
  gallery,
  candidates,
  draft,
  saving,
  onClose,
  onToggle,
  onMove,
  onRestore,
  onSave,
}: {
  gallery: CreatorGallery;
  candidates: string[];
  draft: string[];
  saving: boolean;
  onClose: () => void;
  onToggle: (photoUrl: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRestore: () => void;
  onSave: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="creator-gallery-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,860px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-primary ring-1 ring-inset ring-secondary shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-secondary px-5 py-5 md:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-quaternary">Public gallery</p>
            <h4 id="creator-gallery-title" className="mt-1 text-lg font-semibold text-primary">{gallery.name}</h4>
            <p className="mt-1 text-sm text-tertiary">Select photos below, then set their display order.</p>
          </div>
          <Button color="link-gray" size="sm" onClick={onClose} isDisabled={saving}>Close</Button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-5 md:px-6">
          <section>
            <div className="flex items-center justify-between gap-3">
              <h5 className="text-sm font-semibold text-secondary">Visible order</h5>
              <span className="text-xs text-quaternary">{draft.length} selected</span>
            </div>
            {draft.length === 0 ? (
              <p className="mt-3 rounded-lg bg-secondary px-3.5 py-3 text-sm text-tertiary">
                This gallery will be hidden once saved. Add a photo below to keep it visible.
              </p>
            ) : (
              <ol className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {draft.map((photoUrl, index) => (
                  <li key={photoUrl} className="group relative overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ring-secondary">
                    <div className="aspect-[4/3] bg-primary">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex items-center justify-between gap-1 px-2 py-2">
                      <span className="text-xs font-medium tabular-nums text-tertiary">{index + 1}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Move photo ${index + 1} earlier`}
                          disabled={index === 0 || saving}
                          onClick={() => onMove(index, -1)}
                          className="rounded-md px-2 py-1 text-xs text-secondary ring-1 ring-inset ring-secondary transition-colors hover:bg-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Move photo ${index + 1} later`}
                          disabled={index === draft.length - 1 || saving}
                          onClick={() => onMove(index, 1)}
                          className="rounded-md px-2 py-1 text-xs text-secondary ring-1 ring-inset ring-secondary transition-colors hover:bg-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove photo ${index + 1} from gallery`}
                          disabled={saving}
                          onClick={() => onToggle(photoUrl)}
                          className="rounded-md px-2 py-1 text-xs text-error-primary ring-1 ring-inset ring-error_subtle transition-colors hover:bg-error-primary disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="mt-7 border-t border-secondary pt-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h5 className="text-sm font-semibold text-secondary">Available photos</h5>
                <p className="mt-1 text-xs text-tertiary">
                  Includes this creator&apos;s existing About gallery, shared group photos, and tagged Admin Photos uploads.
                </p>
              </div>
              <span className="text-xs text-quaternary">Click to add or remove</span>
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {candidates.map((photoUrl) => {
                const selectedIndex = draft.indexOf(photoUrl);
                const selected = selectedIndex !== -1;
                return (
                  <li key={photoUrl}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      disabled={saving}
                      onClick={() => onToggle(photoUrl)}
                      className={cx(
                        "group relative block w-full overflow-hidden rounded-xl bg-secondary text-left ring-1 ring-inset transition-all disabled:cursor-not-allowed",
                        selected
                          ? "ring-brand shadow-[0_0_0_1px_var(--color-brand-600)]"
                          : "ring-secondary hover:-translate-y-0.5 hover:ring-primary",
                      )}
                    >
                      <div className="aspect-[4/3] bg-primary">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoUrl} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" loading="lazy" />
                      </div>
                      <span className={cx(
                        "absolute right-2 top-2 rounded-md px-2 py-1 text-xs font-semibold shadow-sm",
                        selected ? "bg-brand-solid text-white" : "bg-primary/90 text-secondary",
                      )}>
                        {selected ? `#${selectedIndex + 1}` : "Add"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-secondary px-5 py-4 md:px-6">
          <Button color="link-gray" size="sm" onClick={onRestore} isDisabled={saving || !gallery.isCustomized}>
            Restore default gallery
          </Button>
          <div className="flex items-center gap-3">
            <Button color="secondary" size="md" onClick={onClose} isDisabled={saving}>Cancel</Button>
            <Button color="primary" size="md" onClick={onSave} isDisabled={saving}>
              {saving ? "Saving…" : "Save gallery"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function uniquePhotoUrls(photoUrls: readonly string[]): string[] {
  return [...new Set(photoUrls.filter(Boolean))];
}
