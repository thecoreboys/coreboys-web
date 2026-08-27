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
      <section className="relative isolate overflow-hidden border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={original.posterUrl} alt="" className="absolute inset-0 -z-30 h-full w-full scale-110 object-cover opacity-20 blur-xl" />
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_76%_38%,rgba(31,112,255,.19),transparent_35%),linear-gradient(90deg,rgba(5,5,7,.99)_5%,rgba(5,5,7,.91)_48%,rgba(5,5,7,.7)),linear-gradient(0deg,#070708,transparent_62%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,.018)_1px,transparent_1px)] bg-[size:100%_4px] opacity-30" />
        <div className="mx-auto flex min-h-[42rem] max-w-[1600px] flex-col px-5 py-10 md:px-10 md:py-12">
          <Link href="/#events-series-challenges" className="w-fit text-xs font-semibold uppercase tracking-[.16em] text-white/60 transition hover:text-white">← CORE Originals</Link>
          <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,30rem)] lg:gap-16 lg:py-6">
            <div className="max-w-4xl self-center">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-pink-300">CORE Original</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-.055em] sm:text-5xl md:text-7xl">{original.title}</h1>
              {original.summary ? <p className="mt-4 max-w-2xl text-base leading-7 text-white/68 md:text-lg">{original.summary}</p> : null}
              <p className="mt-5 text-sm text-white/55">{items.length ? `${items.length} episode${items.length === 1 ? "" : "s"} available` : "New CORE Original · Premiering soon"}</p>
            </div>
            <div className="relative mx-auto w-full max-w-[25rem] lg:mr-0 lg:max-w-[28rem]">
              <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-blue-500/15 blur-3xl" />
              <div className="overflow-hidden rounded-2xl border border-white/15 bg-black/30 p-1.5 shadow-[0_28px_90px_rgba(0,0,0,.62),0_0_45px_rgba(38,124,255,.15)] backdrop-blur-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={original.posterUrl} alt={`${original.title} poster`} className="aspect-[2/3] h-auto w-full rounded-[.75rem] object-cover" />
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1600px] px-5 pt-10 md:px-10 md:pt-14">
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">Episodes</h2>
        {items.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((item) => (
          <Link key={item.id} href={item.sourceUrl as never} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl bg-white/[.045] ring-1 ring-white/10 transition hover:-translate-y-1 hover:bg-white/[.075] hover:ring-white/25">
            <div className="aspect-video overflow-hidden bg-white/5">{item.posterUrl ? <img src={item.posterUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : null}</div>
            <div className="p-3"><p className="line-clamp-2 text-sm font-bold leading-5">{item.title}</p>{item.subtitle ? <p className="mt-1 truncate text-xs text-white/55">{item.subtitle}</p> : null}</div>
          </Link>
        ))}</div> : <div className="mt-5 rounded-xl border border-white/10 bg-white/[.025] px-5 py-10 text-sm leading-6 text-white/58">This CORE Original is coming soon. Episodes and extras will appear here as they are released.</div>}
      </section>
    </main>
  );
}
