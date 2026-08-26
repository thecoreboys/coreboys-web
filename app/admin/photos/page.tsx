import type { Metadata } from "next";
import { Database01, HardDrive, Folder, Image01 } from "@untitledui/icons";
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
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { Badge } from "@/components/base/badges/badges";
import { BrowserDateTime } from "@/components/ui/BrowserDateTime";

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
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
        <AdminPageHeader
          eyebrow="Admin · Photos"
          title="Photo storage."
          supporting="Upload new photos to DigitalOcean Spaces (rows land in media_assets) or browse the synced static gallery in /public."
        />

        {/* Admin upload + gallery */}
        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-10">
            <PhotoManager people={peopleOptions()} />
          </div>
        </section>

        {/* KPIs */}
        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-10">
            <ul className="grid grid-cols-2 gap-5 md:grid-cols-4">
              <Stat icon={Image01} label="Total photos" value={`${metas.length}`} />
              <Stat
                icon={HardDrive}
                label="Storage"
                value={formatBytes(totalBytes)}
                sub="across all sources"
              />
              <Stat
                icon={Folder}
                label="Buckets"
                value={`${byBucket.size}`}
                sub="member · crew · group"
              />
              <Stat
                icon={Database01}
                label="Versions"
                value="1"
                sub="Phase 4 will surface 5 per photo"
              />
            </ul>
          </div>
        </section>

        {/* Per-bucket breakdown */}
        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-10">
            <h2 className="text-lg font-semibold tracking-tight text-primary">By source</h2>
            <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[...byBucket.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([bucket, bytes]) => (
                  <li
                    key={bucket}
                    className="flex items-center justify-between gap-3 rounded-xl bg-primary px-4 py-3 ring-1 ring-inset ring-secondary shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <span className="font-mono text-sm text-primary">{bucket}</span>
                    <Badge type="pill-color" size="sm" color="gray">
                      {formatBytes(bytes)}
                    </Badge>
                  </li>
                ))}
            </ul>
          </div>
        </section>

        {/* Photo table */}
        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-8 md:px-8 md:py-12">
            <h2 className="text-lg font-semibold tracking-tight text-primary">
              All photos · {metas.length}
            </h2>
            <div className="mt-4 overflow-x-auto rounded-xl bg-primary ring-1 ring-inset ring-secondary shadow-xs">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-secondary bg-secondary text-left">
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
                        className={`transition-colors hover:bg-secondary ${
                          i === 0 ? "" : "border-t border-secondary"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <a
                            href={m.src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 hover:text-primary"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={m.src}
                              alt=""
                              className="h-10 w-10 rounded-lg object-cover"
                              loading="lazy"
                            />
                            <span className="font-mono text-sm text-tertiary">
                              {m.src.split("/").pop()}
                            </span>
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <Badge type="pill-color" size="sm" color="gray">
                            {bucket}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-tertiary">
                          {m.takenAt ? (
                            <BrowserDateTime
                              value={m.takenAt}
                              options={{ month: "short", day: "numeric", year: "2-digit" }}
                              fallback="—"
                            />
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-tertiary">
                          {m.width && m.height ? `${m.width}×${m.height}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-tertiary">
                          {formatBytes(m.size)}
                        </td>
                        <td className="px-4 py-3 truncate text-tertiary">
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
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon?: React.FC<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <li className="rounded-xl bg-primary p-5 ring-1 ring-inset ring-secondary shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-center gap-3">
        {Icon ? <FeaturedIcon icon={Icon} size="md" color="brand" theme="modern" /> : null}
        <p className="text-sm font-medium text-tertiary">{label}</p>
      </div>
      <p className="mt-3 text-display-xs font-semibold tracking-tight text-primary tabular-nums">
        {value}
      </p>
      {sub ? <p className="mt-1 text-sm text-quaternary">{sub}</p> : null}
    </li>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold text-quaternary ${align === "right" ? "text-right" : ""}`}
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
