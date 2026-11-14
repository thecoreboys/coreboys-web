import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCoreOriginal } from "@/lib/core-originals";
import Image from "@/components/ui/SiteImage";
import { OriginalEpisodes, OriginalStartButton } from "@/components/watch/OriginalEpisodes";

export const dynamic = "force-dynamic";
const loadOriginal = cache(getCoreOriginal);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadOriginal(slug).catch(() => null);
  return result ? { title: `${result.original.title} · CORE Originals`, description: result.original.summary ?? undefined } : { title: "CORE Originals" };
}

export default async function CoreOriginalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await loadOriginal(slug).catch(() => null);
  if (!result) notFound();
  const { original } = result;
  const items = [...result.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const episodeArtwork = items.find((item) => item.posterUrl)?.posterUrl;
  const artwork = episodeArtwork || original.posterUrl;
  return <div className="min-h-screen bg-[#0b0b0e] pb-16 text-white">
    <header className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-10 md:grid-cols-2 md:px-8 md:py-14">
      <div><Link href="/#events-series-challenges" className="text-sm text-white/70 underline underline-offset-4">CORE Originals</Link><h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{original.title}</h1>{original.summary ? <p className="mt-4 max-w-xl text-base leading-7 text-white/75">{original.summary}</p> : null}<p className="mt-4 text-sm text-white/65">{items.length ? `${items.length} episode${items.length === 1 ? "" : "s"} available` : "No episodes have been published here yet."}</p><OriginalStartButton items={items} /></div>
      <figure><div className="relative aspect-video overflow-hidden rounded-lg bg-white/5"><Image src={artwork} alt={`${original.title} artwork`} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" priority /></div>{!episodeArtwork ? <figcaption className="mt-2 text-sm text-white/60">Illustrated series artwork</figcaption> : null}</figure>
    </header>
    <section id="episodes" className="mx-auto max-w-7xl border-t border-white/15 px-5 pt-8 md:px-8"><h2 className="text-2xl font-semibold">Episodes</h2>{items.length ? <OriginalEpisodes items={items} /> : <p className="mt-5 text-base text-white/70">Episodes will appear here when they are available. <Link href="/#latest" className="underline">Browse recent videos</Link></p>}</section>
  </div>;
}
