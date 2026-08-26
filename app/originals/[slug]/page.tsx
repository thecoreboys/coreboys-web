import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCoreOriginal } from "@/lib/core-originals";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getCoreOriginal(slug).catch(() => null);
  return result ? { title: `${result.original.title} · CORE Originals` } : { title: "CORE Originals" };
}

export default async function CoreOriginalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getCoreOriginal(slug).catch(() => null);
  if (!result) notFound();
  const { original, items } = result;
  return (
    <main className="min-h-screen bg-[#070708] pb-20 text-white">
      <section className="relative isolate min-h-[38rem] overflow-hidden border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={original.posterUrl} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-45" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,5,7,.98),rgba(5,5,7,.76)_48%,rgba(5,5,7,.54)),linear-gradient(0deg,#070708,transparent_65%)]" />
        <div className="mx-auto flex min-h-[38rem] max-w-[1600px] flex-col justify-end px-5 py-12 md:px-10 md:py-16">
          <Link href="/#events-series-challenges" className="mb-auto w-fit text-xs font-semibold uppercase tracking-[.16em] text-white/60 transition hover:text-white">← CORE Originals</Link>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-pink-300">CORE Originals</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-[-.055em] md:text-7xl">{original.title}</h1>
          {original.summary ? <p className="mt-4 max-w-2xl text-base leading-7 text-white/68 md:text-lg">{original.summary}</p> : null}
          <p className="mt-5 text-sm text-white/52">{items.length ? `${items.length} approved video${items.length === 1 ? "" : "s"} in this collection` : "New CORE Original · No episodes posted yet"}</p>
        </div>
      </section>
      <section className="mx-auto max-w-[1600px] px-5 pt-10 md:px-10 md:pt-14">
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">From this original</h2>
        {items.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((item) => (
          <Link key={item.id} href={item.sourceUrl as never} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl bg-white/[.045] ring-1 ring-white/10 transition hover:-translate-y-1 hover:bg-white/[.075] hover:ring-white/25">
            <div className="aspect-video overflow-hidden bg-white/5">{item.posterUrl ? <img src={item.posterUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : null}</div>
            <div className="p-3"><p className="line-clamp-2 text-sm font-bold leading-5">{item.title}</p>{item.subtitle ? <p className="mt-1 truncate text-xs text-white/55">{item.subtitle}</p> : null}</div>
          </Link>
        ))}</div> : <div className="mt-5 rounded-xl border border-dashed border-white/15 bg-white/[.025] px-5 py-10 text-sm text-white/55">Nothing has been approved for this original yet.</div>}
      </section>
    </main>
  );
}
