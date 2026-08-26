import type { Metadata } from "next";
import { Suspense } from "react";
import { MultiPlayerStage } from "@/components/watch/MultiPlayerStage";
import { getWatchCatalog } from "@/lib/watch/catalog";

export const metadata: Metadata = {
  title: "Chat",
  description: "Every CORE Twitch chat in one calm, customizable room.",
  alternates: { canonical: "/chat" },
};

export const dynamic = "force-dynamic";

export default async function ChatHubPage() {
  const catalog = await getWatchCatalog();
  return (
    <Suspense fallback={<div className="min-h-[calc(100dvh-4rem)] bg-[#070709]" />}>
      <MultiPlayerStage catalog={catalog} autoFillLive liveRoom />
    </Suspense>
  );
}
