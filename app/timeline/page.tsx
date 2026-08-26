import type { Metadata } from "next";
import Link from "next/link";
import { WatchChrome } from "@/components/watch/WatchChrome";
import { HOUSE_TIMELINE } from "@/lib/watch/timeline";
import { getWatchCatalog } from "@/lib/watch/catalog";
import "../watch/watch.css";

export const metadata: Metadata = {
  title: "Timeline",
  description: "The house, as a year — eras, not a feed.",
  alternates: { canonical: "/timeline" },
};

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const catalog = await getWatchCatalog();
  return (
    <WatchChrome catalog={catalog}>
      <main className="mx-auto max-w-3xl px-5 py-16 md:px-8">
        <p className="watch-kicker">House history</p>
        <h1 className="watch-title mt-3 text-5xl md:text-6xl">The year in stills</h1>
        <p className="mt-4 max-w-lg text-white/55">
          Not a social timeline. Chapters. Click a name to enter their network.
        </p>
        <ol className="mt-14 space-y-0">
          {HOUSE_TIMELINE.map((beat, i) => (
            <li key={beat.id} className="relative border-l border-[color:var(--core)]/35 pl-8 pb-12">
              <span className="absolute -left-1.5 top-1.5 size-3 rounded-full bg-[color:var(--core)]" />
              <p className="watch-kicker">{beat.when}</p>
              <h2 className="watch-title mt-2 text-3xl">{beat.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-white/65">{beat.body}</p>
              {beat.slug ? (
                <Link
                  href={`/watch/network/${beat.slug}` as never}
                  className="mt-3 inline-block text-sm text-[color:var(--core)] hover:underline"
                >
                  Enter network
                </Link>
              ) : null}
              {i === HOUSE_TIMELINE.length - 1 ? null : null}
            </li>
          ))}
        </ol>
      </main>
    </WatchChrome>
  );
}
