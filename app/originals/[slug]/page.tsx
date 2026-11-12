import { withPageMetadata } from "@/lib/seo";
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
  return withPageMetadata(`/originals/${encodeURIComponent(slug)}`, result ? {
    title: `${result.original.title} · CORE Originals`,
    description: result.original.summary || `Watch ${result.original.title} from CORE Originals. Browse episodes and creator moments from The Core Boys.`,
    openGraph: { images: [{ url: result.original.posterUrl, alt: `${result.original.title} — CORE Originals` }] },
    keywords: [result.original.title, "CORE Originals", "episodes"],
  } : { title: "CORE Originals", robots: { index: false, follow: false } });
}

export default async function CoreOriginalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await loadOriginal(slug).catch(() => null);
  if (!result) notFound();
  const { original } = result;
  const items = [...result.items].sort((a, b) => a.sortOrder - b.sortOrder);
  return <div className="relative isolate min-h-screen overflow-hidden bg-[#0b0b0e] pb-16 text-white">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <Image src={original.posterUrl} alt="" fill sizes="100vw" className="scale-110 object-cover opacity-25 blur-3xl" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0b0e]/70 via-[#0b0b0e]/90 to-[#0b0b0e]" />
    </div>
    <header className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] md:gap-14 md:px-8 md:py-14">
      <div><Link href="/#events-series-challenges" className="text-sm text-white/70 underline underline-offset-4">CORE Originals</Link><h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{original.title}</h1>{original.summary ? <p className="mt-4 max-w-xl text-base leading-7 text-white/75">{original.summary}</p> : null}<p className="mt-4 text-sm text-white/65">{items.length ? `${items.length} episode${items.length === 1 ? "" : "s"} available` : "No episodes have been published here yet."}</p><OriginalStartButton items={items} /></div>
      <figure className="mx-auto w-full max-w-[18rem] md:max-w-none"><div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5 shadow-2xl ring-1 ring-white/15"><Image src={original.posterUrl} alt={`${original.title} poster`} fill sizes="(max-width: 768px) 288px, 336px" className="object-cover" priority /></div></figure>
    </header>
    <section id="episodes" className="mx-auto max-w-7xl border-t border-white/15 px-5 pt-8 md:px-8"><h2 className="text-2xl font-semibold">Episodes</h2>{items.length ? <OriginalEpisodes items={items} /> : <p className="mt-5 text-base text-white/70">Episodes will appear here when they are available. <Link href="/#latest" className="underline">Browse recent videos</Link></p>}</section>
  </div>;
}
