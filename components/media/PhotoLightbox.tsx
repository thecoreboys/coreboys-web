"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Download,
  Image as ImageIcon,
  MapPin,
  X,
} from "lucide-react";

export type LightboxPerson = {
  id: string;
  slug: string;
  name: string;
  accent: string;
  avatarUrl?: string;
  href?: string;
};

type Meta = {
  size?: number;
  takenAt?: string;
  width?: number;
  height?: number;
  camera?: string;
  lens?: string;
  iso?: number;
  fNumber?: number;
  exposureTime?: string;
  focalLength?: number;
  gps?: { latitude: number; longitude: number };
};

type DownloadFormat = {
  key: "original" | "jpg" | "png" | "half";
  label: string;
  ext: "JPG" | "PNG";
  note: string;
};

function downloadsFor(src: string): DownloadFormat[] {
  const ext = src.split(".").pop()?.toLowerCase() ?? "jpg";
  const isPng = ext === "png";
  const list: DownloadFormat[] = [
    {
      key: "original",
      label: "Original",
      ext: isPng ? "PNG" : "JPG",
      note: "as uploaded · full resolution",
    },
  ];
  if (!isPng) {
    list.push({ key: "png", label: "PNG (lossless)", ext: "PNG", note: "transcoded · sharp" });
  } else {
    list.push({ key: "jpg", label: "JPG (compressed)", ext: "JPG", note: "transcoded · sharp" });
  }
  list.push({ key: "half", label: "0.5x preview", ext: "JPG", note: "half-size compressed · sharp" });
  return list;
}

/**
 * Thin photo lightbox used by member / crew galleries. Pulls metadata
 * from `/api/photos/meta` on demand so we don't have to plumb full EXIF
 * through every page that wants the rich modal.
 *
 * Same visual chrome as `MediaGallery`'s admin-aware modal, minus the
 * tag-editing form.
 */
export function PhotoLightbox({
  src,
  alt,
  people,
  onClose,
}: {
  src: string;
  alt?: string;
  people: LightboxPerson[];
  onClose: () => void;
}) {
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/photos/meta?src=${encodeURIComponent(src)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setMeta(data as Meta);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative grid w-full max-w-[1200px] grid-cols-1 overflow-hidden rounded-2xl bg-secondary ring-1 ring-inset ring-secondary shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)] md:grid-cols-[1.5fr_1fr]"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "90vh" }}
      >
        <div className="relative flex items-center justify-center bg-black p-4 md:p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt ?? (people.map((p) => p.name).join(", ") || "CORE photo")}
            className="max-h-[60vh] max-w-full object-contain md:max-h-[80vh]"
          />
        </div>

        <aside className="relative flex flex-col gap-5 overflow-y-auto p-5 md:p-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] transition-all hover:scale-110 hover:border-[color:var(--core)] hover:text-[color:var(--core)]"
          >
            <X size={15} />
          </button>

          <div className="pr-12">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-quaternary">
              In this photo
            </p>
            <ul className="mt-3 flex flex-wrap items-center gap-2">
              {people.length === 0 ? (
                <li className="text-sm text-tertiary">No one tagged</li>
              ) : null}
              {people.map((p) => (
                <li key={p.id}>
                  <Link
                    href={(p.href ?? "#") as never}
                    className="group/mention inline-flex items-center gap-2 rounded-full border bg-[color:var(--bg)] py-1 pl-1 pr-3 transition-all hover:-translate-y-0.5"
                    style={{ borderColor: `${p.accent}88`, color: readableInk(p.accent) }}
                  >
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatarUrl}
                        alt=""
                        className="h-6 w-6 rounded-full ring-1 ring-inset"
                        style={{ ["--tw-ring-color" as string]: `${p.accent}66` }}
                      />
                    ) : (
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold uppercase ring-1 ring-inset"
                        style={{
                          ["--tw-ring-color" as string]: `${p.accent}66`,
                          background: "rgba(8,8,10,0.5)",
                        }}
                      >
                        {p.name[0]}
                      </span>
                    )}
                    <span className="text-sm font-semibold tracking-tight">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-quaternary">
              <Camera size={13} /> Metadata
            </p>
            <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 text-sm">
              <Row label="Taken" value={formatLongDate(meta?.takenAt)} />
              <Row
                label="Resolution"
                value={meta?.width && meta?.height ? `${meta.width} × ${meta.height}` : "—"}
              />
              <Row label="Size" value={formatBytes(meta?.size)} />
              <Row label="Camera" value={meta?.camera ?? "—"} />
              <Row label="Lens" value={meta?.lens ?? "—"} />
              <Row label="Focal" value={meta?.focalLength ? `${meta.focalLength}mm` : "—"} />
              <Row label="Aperture" value={meta?.fNumber ? `f/${meta.fNumber}` : "—"} />
              <Row label="Shutter" value={meta?.exposureTime ?? "—"} />
              <Row label="ISO" value={meta?.iso ? `${meta.iso}` : "—"} />
            </dl>
            {meta?.gps ? (
              <a
                href={`https://www.google.com/maps?q=${meta.gps.latitude},${meta.gps.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-tertiary hover:text-primary"
              >
                <MapPin size={14} />
                {meta.gps.latitude.toFixed(4)}, {meta.gps.longitude.toFixed(4)}
              </a>
            ) : null}
          </div>

          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-quaternary">
              <ImageIcon size={13} /> Download
            </p>
            <div className="mt-2 overflow-hidden rounded-xl ring-1 ring-inset ring-secondary">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-secondary bg-secondary text-left">
                    <th className="px-2.5 py-2 text-xs font-medium uppercase tracking-[0.14em] text-tertiary">
                      Format
                    </th>
                    <th className="px-2.5 py-2 text-right text-xs font-medium uppercase tracking-[0.14em] text-tertiary">
                      Size
                    </th>
                    <th className="px-2.5 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {downloadsFor(src).map((f) => {
                    const isOriginal = f.key === "original";
                    const href = isOriginal
                      ? src
                      : `/api/photos/render?src=${encodeURIComponent(src)}&format=${f.key}`;
                    const sizeLabel = isOriginal ? formatBytes(meta?.size) : "—";
                    return (
                      <tr
                        key={f.key}
                        className="border-t border-secondary first:border-t-0 transition-colors hover:bg-secondary"
                      >
                        <td className="px-2.5 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-flex items-center rounded-md bg-primary px-1.5 py-0.5 text-xs font-semibold tracking-tight text-primary ring-1 ring-inset ring-secondary">
                              {f.ext}
                            </span>
                            <span className="flex flex-col leading-tight">
                              <span className="text-sm font-semibold text-primary">
                                {f.label}
                              </span>
                              <span className="text-xs text-quaternary">
                                {f.note}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-right tabular-nums text-tertiary">
                          {sizeLabel}
                        </td>
                        <td className="px-2.5 py-2 text-right">
                          <a
                            href={href}
                            download
                            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-tertiary ring-1 ring-inset ring-secondary transition-colors hover:text-primary"
                          >
                            <Download size={12} /> Save
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {meta?.width && meta?.height ? (
              <p className="mt-2 text-xs text-quaternary">
                {meta.width} × {meta.height}
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-quaternary">{label}</dt>
      <dd className="text-primary">{value}</dd>
    </>
  );
}

function formatBytes(n: number | undefined): string {
  if (!n) return "—";
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function formatLongDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function readableInk(hex: string): string {
  const m = /^#?([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return "var(--ink)";
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6) return "var(--ink)";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.78 ? "var(--ink)" : hex;
}
