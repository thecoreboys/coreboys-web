"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";

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
 */
export function PhotoManager({ people }: PhotoManagerProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tagOpenId, setTagOpenId] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<PersonOption[]>([]);
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

  useEffect(() => {
    load();
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
    if (succeeded > 0) load();
    if (failed === 0) setUploadError(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this photo? This removes the asset row + the Spaces object.")) return;
    try {
      const res = await fetch(`/api/admin/photos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPhotos((prev) => prev.filter((p) => p.id !== id));
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

  return (
    <div className="flex flex-col gap-6">
      {/* Uploader */}
      <section className="rounded-xl border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)]/60 p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
          Upload
        </p>
        <h3 className="mt-1 text-[16px] font-bold tracking-tight text-[color:var(--ink)]">
          Drop photos here.
        </h3>
        <p className="mt-1 text-[12px] text-[color:var(--ink-dim)]">
          JPEG / PNG / WebP / HEIC / AVIF. EXIF gets parsed automatically; bytes
          stream to DO Spaces; row lands in <code className="font-mono">media_assets</code>.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="btn btn-primary cursor-pointer">
            <Upload size={14} />
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
          {uploadError ? (
            <span className="text-[12px] text-[color:var(--core)]">{uploadError}</span>
          ) : null}
        </div>
      </section>

      {/* Gallery */}
      <section>
        <header className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-bold tracking-tight text-[color:var(--ink)]">
            Admin uploads · {photos.length}
          </h3>
          <button
            type="button"
            onClick={load}
            className="text-[11px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
          >
            Refresh
          </button>
        </header>

        {error ? (
          <div className="rounded-md border border-[color:var(--core)]/40 bg-[color:var(--core)]/10 p-3 text-[12px] text-[color:var(--core)]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-[12px] text-[color:var(--ink-faint)]">Loading…</p>
        ) : photos.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-faint)]">
            No admin-uploaded photos yet. Drop one in above.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {photos.map((p) => (
              <li
                key={p.id}
                className="overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)]"
              >
                <div className="relative aspect-square bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.cdn_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-col gap-1 p-2.5">
                  <p className="font-mono text-[10px] tabular-nums text-[color:var(--ink-dim)]">
                    {p.width && p.height ? `${p.width}×${p.height}` : "—"}
                    {p.taken_at
                      ? ` · ${new Date(p.taken_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}`
                      : ""}
                  </p>
                  {p.camera_make ? (
                    <p className="truncate font-mono text-[10px] text-[color:var(--ink-faint)]">
                      {p.camera_make} {p.camera_model ?? ""}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openTagEditor(p.id)}
                      className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] px-2 py-1 text-[10px] font-semibold uppercase tracking-tight text-[color:var(--ink-dim)] hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
                    >
                      Tag
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] hover:border-[color:var(--core)] hover:text-[color:var(--core)]"
                    >
                      <Trash2 size={11} />
                    </button>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setTagOpenId(null)}
        >
          <div
            className="w-full max-w-[520px] rounded-xl border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
              Manual face tags
            </p>
            <h4 className="mt-1 text-[15px] font-bold tracking-tight text-[color:var(--ink)]">
              Pick everyone visible.
            </h4>
            <p className="mt-1 text-[12px] text-[color:var(--ink-dim)]">
              No AI — just check who&apos;s in the photo. Saves to{" "}
              <code className="font-mono">media_face_tags</code>.
            </p>
            <ul className="mt-4 flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
              {people.map((p) => {
                const active = activeTags.some((x) => x.kind === p.kind && x.ref === p.ref);
                return (
                  <li key={`${p.kind}:${p.ref}`}>
                    <button
                      type="button"
                      onClick={() => toggleTag(p)}
                      aria-pressed={active}
                      className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                        active
                          ? "border-[color:var(--core)] bg-[color:var(--core)]/12 text-[color:var(--ink)]"
                          : "border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
                      }`}
                    >
                      <span>{p.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                        {p.kind}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTagOpenId(null)}
                className="text-[12px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
              >
                Cancel
              </button>
              <button type="button" onClick={saveTags} className="btn btn-primary">
                Save tags
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
