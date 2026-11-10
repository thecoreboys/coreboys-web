import type { Metadata } from "next";
import { Suspense } from "react";
import { MultiviewEntry } from "@/components/watch/MultiviewEntry";
import { getHomeWatchCatalog, getWatchCatalog } from "@/lib/watch/catalog";
import { compactWatchCatalog } from "@/lib/watch/catalog-cache";
import { multiviewRequestedReferences, projectMultiviewCatalog } from "@/lib/watch/multiview-catalog";

export const metadata: Metadata = {
  title: "Chat",
  description: "Every CORE Twitch chat in one calm, customizable room.",
  alternates: { canonical: "/chat" },
};

export const dynamic = "force-dynamic";

export default async function ChatHubPage({ searchParams }: {
  searchParams: Promise<{ add?: string | string[]; layout?: string | string[] }>;
}) {
  const params = await searchParams;
  const references = multiviewRequestedReferences({
    add: Array.isArray(params.add) ? params.add[0] : params.add,
    layout: Array.isArray(params.layout) ? params.layout[0] : params.layout,
  });
  const catalog = await (references.length ? getWatchCatalog() : getHomeWatchCatalog());
  return (
    <Suspense fallback={<div className="min-h-[calc(100dvh-4rem)] bg-[#070709]" />}>
      <MultiviewEntry catalog={compactWatchCatalog(projectMultiviewCatalog(catalog, references))} autoFillLive liveRoom />
    </Suspense>
  );
}
