import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TranscriptManager } from "@/components/admin/TranscriptManager";
import { CreatorTagManager } from "@/components/admin/CreatorTagManager";
export const metadata: Metadata = { title: "Media intelligence · Admin", robots: { index: false, follow: false } };
export default function MediaIntelligencePage() {
  return <main className="min-h-screen bg-secondary pb-24 pt-20 md:pt-24">
    <AdminPageHeader eyebrow="Media intelligence" title="Media & creator tags" supporting="Review transcripts, maintain creator profiles, and publish tags for specific video moments." />
    <div className="mx-auto max-w-container space-y-12 px-6 md:px-8"><CreatorTagManager /><TranscriptManager /></div>
  </main>;
}
