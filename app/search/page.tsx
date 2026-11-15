import type { Metadata } from "next";
import { ArchiveSearch } from "@/components/watch/ArchiveSearch";
import "../watch/watch.css";

export const metadata: Metadata = { title: "Search", description: "Find CORE videos and posts by creator, platform, type, and date." };
export default function SearchPage() {
  return <div className="watch-os mx-auto min-h-[var(--page-min-height)] max-w-7xl px-5 py-12 md:px-8"><h1 className="text-4xl font-semibold tracking-tight">Search the archive</h1><p className="mt-3 text-base text-secondary">Find videos, broadcasts, Shorts, photos, and posts.</p><ArchiveSearch /></div>;
}
