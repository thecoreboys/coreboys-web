import type { Metadata } from "next";
import Link from "next/link";
import { Database, FileImage, HardDrive, Layers } from "lucide-react";
import { MEMBERS, CREW } from "@/lib/members";
import {
  getMemberPhotos,
  getCrewPhotos,
  getGroupPhotos,
  readPhotoMetadata,
  sortNewestFirst,
} from "@/lib/asset-index";
import { AuthGate } from "@/components/admin/AuthGate";
import { PhotoManager, type PersonOption } from "@/components/admin/PhotoManager";

export const metadata: Metadata = {
  title: "Admin · Photos",
  robots: { index: false, follow: false },
};

export const revalidate = 600;

/**
 * Admin photo overview. Shows total photo count + cumulative storage,
 * a per-source breakdown, and a paginated table of every photo with
 * size + version status. Phase 4 reads from the
 * `media_storage_summary` view (see 0006 migration); Phase 1 reads
 * directly off the synced /public folders.
 */
export default async function AdminPhotosPage() {
  // Collate every photo path, then read EXIF + size in parallel.
  const allSources: { src: string; bucket: string }[] = [];
  for (const src of getGroupPhotos()) allSources.push({ src, bucket: "group" });
  for (const m of MEMBERS) {
    for (const src of getMemberPhotos(m.slug)) {
      allSources.push({ src, bucket: `member:${m.slug}` });
    }
  }
  for (const c of CREW) {
    for (const src of getCrewPhotos(c.slug)) {
      allSources.push({ src, bucket: `crew:${c.slug}` });
    }
  }

  const metas = await readPhotoMetadata(allSources.map((s) => s.src));
  const totalBytes = metas.reduce((acc, m) => acc + (m.size ?? 0), 0);
  const sortedMeta = sortNewestFirst(metas);

  const byBucket = new Map<string, number>();
  for (const meta of metas) {
    const found = allSources.find((s) => s.src === meta.src);
    if (!found) continue;
    byBucket.set(found.bucket, (byBucket.get(found.bucket) ?? 0) + (meta.size ?? 0));
  }

  return (
    <AuthGate>
      <main className="relative pt-20 md:pt-24">
        <section className="relative mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Link
                href="/admin"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
              >
                ← Admin
              </Link>
              <p className="mt-2 eyebrow">Admin · Photos</p>
              <h1 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
                Photo storage
              </h1>
              <p className="mt-2 max-w-[60ch] text-[14px] text-[color:var(--ink-dim)]">
                Upload new photos to DigitalOcean Spaces (rows land in
                <code className="font-mono"> media_assets</code>) or browse the
                synced static gallery in <code className="font-mono">/public</code>.
              </p>
            </div>
          </div>
        </section>

        {/* Admin upload + gallery */}
        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8 md:py-10">
            <PhotoManager people={peopleOptions()} />
          </div>
        </section>

        {/* KPIs */}
        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8 md:py-10">
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat icon={<FileImage size={11} />} label="Total photos" value={`${metas.length}`} />
              <Stat
                icon={<HardDrive size={11} />}
                label="Storage"
                value={formatBytes(totalBytes)}
                sub="across all sources"
              />
              <Stat
                icon={<Layers size={11} />}
                label="Buckets"
                value={`${byBucket.size}`}
                sub="member · crew · group"
              />
              <Stat
                icon={<Database size={11} />}
                label="Versions"
                value="1"
                sub="Phase 4 will surface 5 per photo"
              />
            </ul>
          </div>
        </section>

        {/* Per-bucket breakdown */}
        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8 md:py-10">
            <h2 className="text-[14px] font-semibold tracking-tight text-[color:var(--ink)]">
              By source
            </h2>
            <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {[...byBucket.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([bucket, bytes]) => (
                  <li
                    key={bucket}
                    className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] px-3 py-2.5"
                  >
                    <span className="font-mono text-[12px] text-[color:var(--ink)]">{bucket}</span>
                    <span className="font-mono text-[12px] tabular-nums text-[color:var(--ink-dim)]">
                      {formatBytes(bytes)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </section>

        {/* Photo table */}
        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8 md:py-12">
            <h2 className="text-[14px] font-semibold tracking-tight text-[color:var(--ink)]">
              All photos · {metas.length}
            </h2>
            <div className="mt-4 overflow-x-auto rounded-lg border border-[color:var(--rule)]">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[color:var(--rule)] bg-[color:var(--surface)] text-left">
                    <Th>File</Th>
                    <Th>Bucket</Th>
                    <Th align="right">Taken</Th>
                    <Th align="right">Resolution</Th>
                    <Th align="right">Size</Th>
                    <Th>Camera</Th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMeta.map((m, i) => {
                    const bucket =
                      allSources.find((s) => s.src === m.src)?.bucket ?? "—";
                    return (
                      <tr
                        key={m.src}
                        className={`transition-colors hover:bg-[color:var(--bg-elev)] ${
                          i === 0 ? "" : "border-t border-[color:var(--rule)]"
                        }`}
                      >
                        <td className="px-3 py-2">
                          <a
                            href={m.src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 hover:text-[color:var(--ink)]"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={m.src}
                              alt=""
                              className="h-9 w-9 rounded object-cover"
                              loading="lazy"
                            />
                            <span className="font-mono text-[11px] text-[color:var(--ink-dim)]">
                              {m.src.split("/").pop()}
                            </span>
                          </a>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-[color:var(--ink-dim)]">
                          {bucket}
                        </td>
                        <td className="px-3 py-2 text-right text-[color:var(--ink-dim)]">
                          {m.takenAt ? formatShort(m.takenAt) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[color:var(--ink-dim)]">
                          {m.width && m.height ? `${m.width}×${m.height}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[color:var(--ink-dim)]">
                          {formatBytes(m.size)}
                        </td>
                        <td className="px-3 py-2 truncate text-[color:var(--ink-dim)]">
                          {m.camera ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </AuthGate>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <li className="rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-[24px] font-bold tracking-tight text-[color:var(--ink)] tabular-nums">
        {value}
      </p>
      {sub ? (
        <p className="mt-1.5 text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
          {sub}
        </p>
      ) : null}
    </li>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-faint)] ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

function formatBytes(n: number): string {
  if (!n) return "—";
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function formatShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return iso;
  }
}

function peopleOptions(): PersonOption[] {
  // Members + crew make up the manual face-tag dropdown. Talents come
  // from the external_people table; we don't fetch those here so the
  // page stays static-renderable. Tagging-by-talent comes in a follow-up.
  const out: PersonOption[] = [];
  for (const m of MEMBERS) {
    out.push({ kind: "member", ref: m.slug, name: m.stageName });
  }
  for (const c of CREW) {
    out.push({ kind: "crew", ref: c.slug, name: c.name });
  }
  return out;
}
