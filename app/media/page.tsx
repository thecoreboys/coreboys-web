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
import { InstagramSection } from "@/components/media/InstagramSection";
import { PageHeader } from "@/components/ui/PageHeader";
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

// Dynamic: the "From our Instagram" section reads the admin session
// cookie to decide whether to show its connect prompt. IG media fetches
// are individually cached via `next.revalidate` in lib/instagram.
export const dynamic = "force-dynamic";

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
    href: `/channels/${m.slug}`,
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
    <>
      <PageHeader
        eyebrow="Stills"
        title="Stills."
        supporting="Every shoot, candid, and group photo. Newest first."
        meta={`${items.length.toLocaleString()} stills`}
      />
      <section id="gallery" className="scroll-mt-24">
        <div className="mx-auto max-w-container px-6 py-10 md:px-16 md:py-14">
          <MediaGallery members={members} taggablePeople={taggablePeople} items={items} />
        </div>
      </section>
      <InstagramSection />
      <SiteFooter />
    </>
  );
}
