"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Download,
  Image as ImageIcon,
  MapPin,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { SearchLg, Stars02, Grid01, Rows01, SearchRefraction } from "@untitledui/icons";
import { Input } from "@/components/base/input/input";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

const STORAGE_KEY = "coreboys-media:v1";

export type Person = {
  id: string;
  slug: string;
  name: string;
  kind: "member" | "crew" | "collab";
  accent: string;
  avatarUrl?: string;
  href?: string;
};

export type PhotoMetaLite = {
  src: string;
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

export type MediaItem = {
  src: string;
  defaultPeopleIds: string[];
  aiDescription?: string;
  credits?: string[];
  meta?: PhotoMetaLite;
};

type Persisted = {
  photoTags: Record<string, string[]>;
  collabs: Array<{ id: string; name: string }>;
  credits: Record<string, string[]>;
};

export type MediaGalleryProps = {
  /** Members only (6) — filter chips render with their Twitch profile picture. */
  members: Person[];
  /** Crew + collab people available for tagging in admin mode. */
  taggablePeople: Person[];
  items: MediaItem[];
};

type DownloadFormat = {
  key: "original" | "jpg" | "png" | "half";
  label: string;
  /** Pretty label for the resulting file extension. */
  ext: "JPG" | "PNG";
  note: string;
};

/**
 * Build the download list for a photo. The native format always shows
 * first as Original (with its real extension); duplicate format rows
 * are skipped (e.g., a JPG original doesn't get a separate "JPG" row).
 */
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
  }
  if (isPng) {
    list.push({
      key: "jpg",
      label: "JPG (compressed)",
      ext: "JPG",
      note: "transcoded · sharp",
    });
  }
  list.push({
    key: "half",
    label: "0.5x preview",
    ext: "JPG",
    note: "half-size compressed · sharp",
  });
  return list;
}

/**
 * Photo gallery with grid + table views, AI search, member-only filter
 * chips (Twitch profile pictures), modal popup for detail (centered,
 * not full-screen), and downloads in 5 formats per photo.
 *
 * Tag editing + collab management are gated behind admin auth. Phase 4
 * swaps the localStorage stub for real /v1/media endpoints.
 */
export function MediaGallery({ members, taggablePeople, items }: MediaGalleryProps) {
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [credits, setCredits] = useState<Record<string, string[]>>({});
  const [collabs, setCollabs] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const aiSearch = query.trim().length > 0;
  const [activeMember, setActiveMember] = useState<string | null>(null);
  const [includeCrew, setIncludeCrew] = useState(false);
  const [includeTalent, setIncludeTalent] = useState(false);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [openPhoto, setOpenPhoto] = useState<MediaItem | null>(null);

  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    try {
      setAuthed(localStorage.getItem("coreboys-auth-demo") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Persisted;
      if (parsed.photoTags) setTags(parsed.photoTags);
      if (parsed.credits) setCredits(parsed.credits);
      if (parsed.collabs) {
        setCollabs(
          parsed.collabs.map((c) => ({
            id: c.id,
            slug: c.id.replace(/^collab:/, ""),
            name: c.name,
            kind: "collab",
            accent: "#a1a1aa",
          })),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback(
    (
      nextTags: Record<string, string[]>,
      nextCollabs: Person[],
      nextCredits: Record<string, string[]>,
    ) => {
      const payload: Persisted = {
        photoTags: nextTags,
        credits: nextCredits,
        collabs: nextCollabs.map((c) => ({ id: c.id, name: c.name })),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    },
    [],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenPhoto(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const allTaggable: Person[] = useMemo(
    () => [...members, ...taggablePeople, ...collabs],
    [members, taggablePeople, collabs],
  );
  const peopleById = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of allTaggable) m.set(p.id, p);
    return m;
  }, [allTaggable]);

  const togglePersonOnPhoto = (src: string, personId: string) => {
    setTags((prev) => {
      const current = prev[src] ?? [];
      const next = current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId];
      const merged = { ...prev, [src]: next };
      persist(merged, collabs, credits);
      return merged;
    });
  };

  const peopleOnItem = useCallback(
    (src: string, defaults: string[]): Person[] => {
      const explicit = tags[src] ?? [];
      const ids = Array.from(new Set([...defaults, ...explicit]));
      return ids
        .map((id) => peopleById.get(id))
        .filter((p): p is Person => !!p);
    },
    [tags, peopleById],
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const peopleHere = peopleOnItem(item.src, item.defaultPeopleIds);
      const hasMember = peopleHere.some((p) => p.kind === "member");
      const hasCrew = peopleHere.some((p) => p.kind === "crew");
      const hasTalent = peopleHere.some((p) => p.kind === "collab");
      if (!hasMember) {
        if (hasCrew && !includeCrew) return false;
        if (hasTalent && !includeTalent && !hasCrew) return false;
        if (!hasCrew && !hasTalent) return false;
      }
      if (activeMember && !peopleHere.some((p) => p.id === activeMember)) return false;
      if (!q) return true;
      const haystack = peopleHere
        .map((p) => p.name.toLowerCase())
        .concat(item.aiDescription?.toLowerCase() ?? "")
        .concat(item.meta?.camera?.toLowerCase() ?? "")
        .concat(item.meta?.lens?.toLowerCase() ?? "")
        .join(" ");
      return haystack.includes(q);
    });
    void aiSearch;
  }, [items, query, activeMember, peopleOnItem, includeCrew, includeTalent, aiSearch]);

  return (
    <div>
      {/* Toolbar — UUI search input + view button group */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[280px] flex-1">
          <Input
            icon={SearchLg}
            size="md"
            value={query}
            onChange={(v) => setQuery(v)}
            placeholder="AI search — describe the shot, e.g. 'marlon laughing on the couch'"
            aria-label="Search photos"
          />
        </div>

        {/* View toggle */}
        <ButtonGroup
          size="md"
          selectedKeys={new Set([view])}
          onSelectionChange={(keys) => {
            const next = Array.from(keys)[0] as "grid" | "table" | undefined;
            if (next) setView(next);
          }}
        >
          <ButtonGroupItem id="grid" iconLeading={Grid01}>
            Grid
          </ButtonGroupItem>
          <ButtonGroupItem id="table" iconLeading={Rows01}>
            Table
          </ButtonGroupItem>
        </ButtonGroup>

        <span className="ml-auto text-sm font-medium text-quaternary">
          {filteredItems.length} of {items.length}
        </span>
      </div>

      {/* AI search backend stub — until the AI ranker is wired up, the
          search box just falls back to substring filtering. Tell users so
          they don't expect natural-language matching yet. */}
      {aiSearch ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-secondary bg-secondary p-4 shadow-xs-skeuomorphic">
          <FeaturedIcon icon={Stars02} size="md" color="brand" theme="light" />
          <p className="text-sm font-medium text-secondary">
            AI search abilty backend is not set up yet sorry guys! &lt;3
          </p>
        </div>
      ) : null}

      {/* Filter chips — Twitch avatar + name */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <FilterChip
          label="All members"
          allIcon
          active={activeMember === null}
          onClick={() => setActiveMember(null)}
        />
        {members.map((p) => (
          <FilterChip
            key={p.id}
            label={p.name}
            avatarUrl={p.avatarUrl}
            color={p.accent}
            active={activeMember === p.id}
            onClick={() => setActiveMember(activeMember === p.id ? null : p.id)}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-[color:var(--rule)]" aria-hidden />
        <ToggleChip
          label="Include crew"
          active={includeCrew}
          onClick={() => setIncludeCrew((v) => !v)}
        />
        <ToggleChip
          label="Include talent"
          active={includeTalent}
          onClick={() => setIncludeTalent((v) => !v)}
        />
      </div>

      {/* Body */}
      {filteredItems.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-secondary bg-secondary p-10 text-center shadow-xs-skeuomorphic">
          <FeaturedIcon icon={SearchRefraction} size="xl" color="gray" theme="modern" />
          <p className="mt-4 text-lg font-semibold text-primary">No photos match</p>
          <p className="mt-1 max-w-[44ch] text-sm text-tertiary">
            Try clearing a filter or a different search.
          </p>
        </div>
      ) : view === "grid" ? (
        <GridView
          items={filteredItems}
          peopleOnItem={peopleOnItem}
          onClick={setOpenPhoto}
        />
      ) : (
        <TableView
          items={filteredItems}
          peopleOnItem={peopleOnItem}
          onClick={setOpenPhoto}
        />
      )}

      {/* Modal */}
      {openPhoto ? (
        <PhotoModal
          item={openPhoto}
          people={peopleOnItem(openPhoto.src, openPhoto.defaultPeopleIds)}
          credits={credits[openPhoto.src] ?? openPhoto.credits ?? []}
          authed={authed}
          allTaggable={allTaggable}
          tags={tags[openPhoto.src] ?? openPhoto.defaultPeopleIds}
          onToggleTag={(personId) => togglePersonOnPhoto(openPhoto.src, personId)}
          onClose={() => setOpenPhoto(null)}
        />
      ) : null}
    </div>
  );
}

function GridView({
  items,
  peopleOnItem,
  onClick,
}: {
  items: MediaItem[];
  peopleOnItem: (src: string, defaults: string[]) => Person[];
  onClick: (item: MediaItem) => void;
}) {
  return (
    <div className="columns-2 gap-3 sm:columns-3 md:columns-4 xl:columns-5 [column-fill:_balance]">
      {items.map((item) => {
        const peopleHere = peopleOnItem(item.src, item.defaultPeopleIds);
        return (
          <button
            key={item.src}
            type="button"
            onClick={() => onClick(item)}
            className="group relative mb-4 block w-full break-inside-avoid rounded-xl border border-secondary bg-secondary p-1.5 text-left shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl cursor-pointer"
          >
            {/* Photo is clipped here so the scale-on-hover stays inside,
                but the chip overlay below can render its tooltip outside.
                aspect-ratio (when EXIF/sharp gave us dims) reserves the
                slot so layout doesn't jump as images stream in. */}
            <span
              className="relative block overflow-hidden rounded-md media-tone"
              style={
                item.meta?.width && item.meta?.height
                  ? { aspectRatio: `${item.meta.width} / ${item.meta.height}` }
                  : undefined
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.src}
                alt={peopleHere.map((p) => p.name).join(", ") || "CORE photo"}
                width={item.meta?.width}
                height={item.meta?.height}
                className="media-fade block h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                loading="lazy"
                decoding="async"
                onLoad={(e) => {
                  (e.currentTarget as HTMLImageElement).dataset.loaded = "";
                }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, transparent 60%, rgba(8,8,10,0.92) 100%)",
                }}
              />
            </span>
            <span className="pointer-events-auto absolute inset-x-2 bottom-2 flex items-center gap-1">
              {peopleHere.slice(0, 6).map((p) => (
                <PersonAvatarChip key={p.id} person={p} size={26} />
              ))}
              {peopleHere.length > 6 ? (
                <span className="inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full border border-white/20 bg-[rgba(8,8,10,0.85)] px-1.5 text-xs font-semibold text-on-image backdrop-blur-md">
                  +{peopleHere.length - 6}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TableView({
  items,
  peopleOnItem,
  onClick,
}: {
  items: MediaItem[];
  peopleOnItem: (src: string, defaults: string[]) => Person[];
  onClick: (item: MediaItem) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl bg-primary ring-1 ring-inset ring-secondary shadow-xs-skeuomorphic">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-secondary bg-secondary text-left">
            <Th>Photo</Th>
            <Th>People</Th>
            <Th align="right">Taken</Th>
            <Th align="right">Resolution</Th>
            <Th align="right">Size</Th>
            <Th>Camera</Th>
            <Th align="right">Download</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const peopleHere = peopleOnItem(item.src, item.defaultPeopleIds);
            return (
              <tr
                key={item.src}
                className={`group cursor-pointer transition-colors hover:bg-secondary ${
                  i === 0 ? "" : "border-t border-secondary"
                }`}
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onClick(item)}
                    className="flex items-center gap-3"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.src}
                      alt=""
                      className="h-12 w-12 rounded-md object-cover"
                      loading="lazy"
                    />
                    <span className="text-sm text-tertiary group-hover:text-primary">
                      {item.src.split("/").pop()}
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {peopleHere.slice(0, 5).map((p) => (
                      <PersonAvatarChip key={p.id} person={p} size={22} />
                    ))}
                    {peopleHere.length > 5 ? (
                      <span className="ml-1 text-xs text-quaternary">
                        +{peopleHere.length - 5}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-tertiary">
                  {item.meta?.takenAt ? formatShortDate(item.meta.takenAt) : "—"}
                </td>
                <td className="px-3 py-2 text-right text-tertiary tabular-nums">
                  {item.meta?.width && item.meta?.height
                    ? `${item.meta.width}×${item.meta.height}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right text-tertiary tabular-nums">
                  {formatBytes(item.meta?.size)}
                </td>
                <td className="px-3 py-2 truncate text-tertiary">
                  {item.meta?.camera ?? "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <a
                    href={item.src}
                    download
                    className="inline-flex items-center gap-1 text-sm font-medium text-tertiary hover:text-[color:var(--core)]"
                  >
                    <Download size={12} /> Original
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PhotoModal({
  item,
  people,
  credits,
  authed,
  allTaggable,
  tags,
  onToggleTag,
  onClose,
}: {
  item: MediaItem;
  people: Person[];
  credits: string[];
  authed: boolean;
  allTaggable: Person[];
  tags: string[];
  onToggleTag: (personId: string) => void;
  onClose: () => void;
}) {
  const meta = item.meta;

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
        {/* Photo — close button moved out to the sidebar */}
        <div className="relative flex items-center justify-center bg-black p-4 md:p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.src}
            alt={people.map((p) => p.name).join(", ") || "CORE photo"}
            className="max-h-[60vh] max-w-full object-contain md:max-h-[80vh]"
          />
        </div>

        {/* Info */}
        <aside className="relative flex flex-col gap-5 overflow-y-auto p-5 md:p-6">
          {/* Sidebar close — top-right, clickable feel. */}
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
                    <span className="text-sm font-semibold tracking-tight">
                      {p.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {authed ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-tertiary hover:text-primary">
                  Edit tags
                </summary>
                <ul className="mt-2 max-h-[220px] overflow-y-auto rounded-lg bg-primary p-1 ring-1 ring-inset ring-secondary">
                  {allTaggable.map((p) => {
                    const checked = tags.includes(p.id);
                    return (
                      <li key={p.id}>
                        <div className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary">
                          <Checkbox
                            isSelected={checked}
                            onChange={() => onToggleTag(p.id)}
                            aria-label={`Tag ${p.name}`}
                            size="sm"
                          />
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: p.accent }}
                          />
                          <span className="text-primary">{p.name}</span>
                          <span className="ml-auto text-xs text-quaternary">
                            {p.kind}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ) : null}
          </div>

          {credits.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-quaternary">
                Credits
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {credits.map((c) => (
                  <li key={c} className="text-sm text-primary">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {item.aiDescription ? (
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-quaternary">
                <Sparkles size={13} /> AI description
              </p>
              <p className="mt-2 text-sm leading-relaxed text-tertiary">
                {item.aiDescription}
              </p>
            </div>
          ) : null}

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
                  {downloadsFor(item.src).map((f) => {
                    const isOriginal = f.key === "original";
                    const href = isOriginal
                      ? item.src
                      : `/api/photos/render?src=${encodeURIComponent(item.src)}&format=${f.key}`;
                    const sizeLabel = isOriginal
                      ? formatBytes(meta?.size)
                      : "—";
                    return (
                      <tr
                        key={f.key}
                        className="border-t border-secondary first:border-t-0 transition-colors hover:bg-secondary"
                      >
                        <td className="px-2.5 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="inline-flex items-center rounded-md bg-primary px-1.5 py-0.5 text-xs font-semibold tracking-tight text-primary ring-1 ring-inset ring-secondary"
                            >
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

          {authed ? <SetAsProfileButton src={item.src} people={people} /> : null}
        </aside>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  avatarUrl,
  color,
  active,
  onClick,
  allIcon = false,
}: {
  label: string;
  avatarUrl?: string;
  color?: string;
  active: boolean;
  onClick: () => void;
  allIcon?: boolean;
}) {
  const tint = color ?? "var(--core)";
  const hasAvatarSlot = !!avatarUrl || allIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border py-1 ${hasAvatarSlot ? "pl-1 pr-3" : "px-3"} text-sm font-medium transition-all cursor-pointer ${
        active
          ? "text-primary"
          : "border-secondary text-tertiary hover:bg-secondary hover:text-primary"
      }`}
      style={
        active
          ? {
              borderColor: tint,
              background: `color-mix(in oklab, ${tint} 18%, transparent)`,
              boxShadow: `0 0 0 1px ${tint}55`,
            }
          : undefined
      }
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-6 w-6 rounded-full ring-1 ring-inset"
          style={{ ["--tw-ring-color" as string]: `${tint}66` }}
        />
      ) : allIcon ? (
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-inset bg-[color:var(--bg)] text-[color:var(--ink-dim)]"
          style={{ ["--tw-ring-color" as string]: `${tint}66` }}
        >
          <Users size={11} />
        </span>
      ) : null}
      {label}
    </button>
  );
}

function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
        active
          ? "border-secondary bg-secondary text-primary"
          : "border-dashed border-secondary bg-transparent text-tertiary hover:text-primary"
      }`}
    >
      {label}
    </button>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`px-3 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-tertiary ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
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

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return iso;
  }
}

function PersonAvatarChip({
  person,
  size = 26,
}: {
  person: Person;
  size?: number;
}) {
  return (
    <span
      className="group/chip relative inline-flex items-center justify-center overflow-visible"
      style={{ width: size, height: size }}
    >
      <span
        className="block transition-transform duration-200 ease-out group-hover/chip:-translate-y-1 group-hover/chip:scale-110"
        style={{
          width: size,
          height: size,
          filter: "drop-shadow(0 0 0 transparent)",
          transitionProperty: "transform, filter",
        }}
      >
        {person.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.avatarUrl}
            alt={person.name}
            width={size}
            height={size}
            className="block rounded-full ring-2 ring-inset transition-shadow"
            style={{
              ["--tw-ring-color" as string]: person.accent,
              background: "rgba(8,8,10,0.6)",
            }}
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center rounded-full ring-2 ring-inset text-xs font-bold uppercase"
            style={{
              ["--tw-ring-color" as string]: person.accent,
              color: person.accent,
              background: "rgba(8,8,10,0.7)",
            }}
          >
            {person.name[0]}
          </span>
        )}
      </span>
      {/* Hover-only colored glow ring */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-200 group-hover/chip:opacity-100"
        style={{
          boxShadow: `0 0 0 2px ${person.accent}, 0 6px 16px -4px ${person.accent}aa`,
          transform: "translateY(-4px) scale(1.1)",
        }}
      />
      {/* Tooltip on hover */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary opacity-0 shadow-lg ring-1 ring-inset ring-secondary transition-opacity duration-150 group-hover/chip:opacity-100"
      >
        {person.name}
      </span>
    </span>
  );
}

/**
 * Some member accents are near-white (Marlon: #f4f4f5) which becomes
 * unreadable as label text on a light/white surface. Clamp the lightness
 * so the label is always legible while the border keeps the original
 * accent color, preserving brand recognition.
 */
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
  // Very light accents collapse to ink (which adapts to theme); everything
  // else keeps the brand hex.
  return lum > 0.78 ? "var(--ink)" : hex;
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

const MEMBER_OVERRIDES_KEY = "coreboys-admin-member-overrides:v1";

function SetAsProfileButton({ src, people }: { src: string; people: Person[] }) {
  const memberPeople = people.filter((p) => p.kind === "member");
  const [savedFor, setSavedFor] = useState<string | null>(null);

  if (memberPeople.length === 0) return null;

  const setProfile = (slug: string) => {
    try {
      const raw = localStorage.getItem(MEMBER_OVERRIDES_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, Record<string, unknown>>) : {};
      parsed[slug] = { ...(parsed[slug] ?? {}), profileImage: src };
      localStorage.setItem(MEMBER_OVERRIDES_KEY, JSON.stringify(parsed));
      setSavedFor(slug);
      window.setTimeout(() => setSavedFor(null), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-secondary bg-primary p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-quaternary">
        Admin · Set as profile image
      </p>
      <ul className="mt-2 flex flex-wrap items-center gap-1.5">
        {memberPeople.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setProfile(p.slug)}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-sm font-medium text-tertiary ring-1 ring-inset ring-secondary hover:text-primary cursor-pointer"
              style={{ boxShadow: savedFor === p.slug ? "inset 0 0 0 1px var(--success)" : undefined }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.accent }} />
              {savedFor === p.slug ? `Saved for ${p.name}` : `Set for ${p.name}`}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-quaternary">
        Phase 4: writes <code className="font-mono">editable_member_overrides.portrait_asset_id</code>.
      </p>
    </div>
  );
}
