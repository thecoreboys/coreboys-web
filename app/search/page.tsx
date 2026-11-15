import type { Metadata } from "next";
import { ArchiveSearch } from "@/components/watch/ArchiveSearch";
import { PageHeader } from "@/components/ui/PageHeader";
import "../watch/watch.css";

export const metadata: Metadata = { title: "Search", description: "Find CORE videos and posts by creator, platform, type, and date." };
export default function SearchPage() {
  return (
    <div className="watch-os core-archive-page min-h-[var(--page-min-height)]">
      <PageHeader eyebrow="Explore CORE" title="Search the archive" supporting="Find videos, broadcasts, Shorts, photos, and posts." />
      <div className="core-archive-body mx-auto max-w-7xl px-5 pb-16 pt-5 md:px-8 md:pb-24">
        <ArchiveSearch />
      </div>
    </div>
  );
}
