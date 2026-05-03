import type { Metadata } from "next";
import { MEMBERS, CREW } from "@/lib/members";
import {
  getMemberPhotos,
  getGroupPhotos,
  getCrewPhotos,
  getCrewPortrait,
  readPhotoMetadata,
  sortNewestFirst,
} from "@/lib/asset-index";
import { fetchUsersByLogin } from "@/lib/twitch";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import {
  MediaGallery,
  type MediaItem,
  type Person,
  type PhotoMetaLite,
} from "@/components/media/MediaGallery";

export const metadata: Metadata = {
  title: "Photos",
  description: "CORE photo gallery — searchable, taggable, sorted newest first.",
  alternates: { canonical: "/media" },
};

export const revalidate = 3600;

export default async function MediaPage() {
  // Twitch profile pictures for the filter chips.
  let avatars: Record<string, string> = {};
  try {
    const users = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatars[login] = u.profile_image_url;
    }
  } catch {
    avatars = {};
  }

  const members: Person[] = MEMBERS.map((m) => ({
    id: `member:${m.slug}`,
    slug: m.slug,
    name: m.stageName,
    kind: "member",
    accent: m.accent,
    avatarUrl: m.portrait ?? avatars[m.twitchLogin.toLowerCase()],
    href: `/m/${m.slug}`,
  }));

  const taggablePeople: Person[] = CREW.map((c) => ({
    id: `crew:${c.slug}`,
    slug: c.slug,
    name: c.name,
    kind: "crew",
    accent: "#a1a1aa",
    avatarUrl: getCrewPortrait(c.slug) ?? undefined,
    href: `/crew/${c.slug}`,
  }));

  type Source = { src: string; defaultPeopleIds: string[] };
  const sources: Source[] = [];
  for (const src of getGroupPhotos()) {
    sources.push({ src, defaultPeopleIds: MEMBERS.map((m) => `member:${m.slug}`) });
  }
  for (const m of MEMBERS) {
    for (const src of getMemberPhotos(m.slug)) {
      sources.push({ src, defaultPeopleIds: [`member:${m.slug}`] });
    }
  }
  for (const c of CREW) {
    for (const src of getCrewPhotos(c.slug)) {
      sources.push({ src, defaultPeopleIds: [`crew:${c.slug}`] });
    }
  }

  const metas = await readPhotoMetadata(sources.map((s) => s.src));
  const sortedMeta = sortNewestFirst(metas);

  const items: MediaItem[] = [];
  for (const m of sortedMeta) {
    const source = sources.find((s) => s.src === m.src);
    if (!source) continue;
    const lite: PhotoMetaLite = {
      src: m.src,
      size: m.size,
      takenAt: m.takenAt,
      width: m.width,
      height: m.height,
      camera: m.camera,
      lens: m.lens,
      iso: m.iso,
      fNumber: m.fNumber,
      exposureTime: m.exposureTime,
      focalLength: m.focalLength,
      gps: m.gps,
    };
    items.push({ src: m.src, defaultPeopleIds: source.defaultPeopleIds, meta: lite });
  }

  return (
    <main className="relative pt-20 md:pt-24">
      <Header total={items.length} />
      <section id="gallery" className="border-t border-[color:var(--rule)] scroll-mt-24">
        <div className="mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
          <MediaGallery members={members} taggablePeople={taggablePeople} items={items} />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function Header({ total }: { total: number }) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(50% 40% at 30% 30%, rgba(239,68,68,0.08), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-[1440px] px-6 py-16 md:px-8 md:py-20">
        <p className="eyebrow">Library · Photos</p>
        <h1 className="mt-2 text-display text-[clamp(40px,6vw,72px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
          The <span className="gradient-text">photo library.</span>
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink)]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-[color:var(--core)]"
              style={{ boxShadow: "0 0 8px rgba(255,59,31,0.7)" }}
            />
            <span className="tabular-nums">{total.toLocaleString()}</span>
            <span className="text-[color:var(--ink-dim)]">photos</span>
          </span>
          <a
            href="#gallery"
            className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[color:var(--rule)] bg-[color:var(--bg)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)] transition-all hover:-translate-y-px hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
          >
            Newest first
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              ↓
            </span>
          </a>
        </div>
        <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-[color:var(--ink-dim)]">
          Search by member, by description, or by camera. Click any photo for full EXIF metadata,
          credits, tagged people, and download options.
        </p>
      </div>
    </section>
  );
}
