import type { Metadata } from "next";
import { Suspense } from "react";
import { TheaterStage } from "@/components/watch/TheaterStage";
import "../watch/watch.css";

export const metadata: Metadata = {
  title: "Theater",
  description: "One stage for Twitch, YouTube, VODs, and clips.",
  alternates: { canonical: "/theater" },
};

export const dynamic = "force-dynamic";

export default function TheaterPage() {
  return (
    <div className="min-h-dvh bg-[#050507]" aria-label="CORE media player">
      <Suspense fallback={<div className="aspect-video bg-black" />}>
        <TheaterStage />
      </Suspense>
    </div>
  );
}
