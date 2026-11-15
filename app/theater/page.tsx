import type { Metadata } from "next";
import { Suspense } from "react";
import { TheaterStage } from "@/components/watch/TheaterStage";
import Link from "next/link";
import { filterAvailableContent } from "@/lib/content-availability";
import { platformForPlayback } from "@/lib/watch/playable";
import type { WatchKind } from "@/lib/watch/types";
import "../watch/watch.css";

export const metadata: Metadata = {
  title: "Theater",
  description: "One stage for Twitch, YouTube, VODs, and clips.",
  alternates: { canonical: "/theater" },
};

export const dynamic = "force-dynamic";

export default async function TheaterPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const text = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const identity = {
    id: text("ref") || text("id"), sourceUrl: text("url"),
    platform: platformForPlayback(text("kind") as WatchKind, text("src"), text("url")),
    twitch: text("kind") === "vod" ? { vodId: text("id") } : undefined,
  };
  if (!(await filterAvailableContent([identity])).length) return (
    <section className="grid min-h-[55vh] place-items-center px-5 text-center">
      <div><h1 className="text-3xl font-semibold">This title is no longer available</h1>
        <p className="mt-3 text-secondary">The source has removed access to this content.</p>
        <Link href="/" className="mt-6 inline-block underline">Browse Watch</Link></div>
    </section>
  );
  return (
    <div className="min-h-dvh bg-[#050507]" aria-label="CORE media player">
      <Suspense fallback={<div className="aspect-video bg-black" />}>
        <TheaterStage />
      </Suspense>
    </div>
  );
}
