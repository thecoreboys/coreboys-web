import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TranscriptManager } from "@/components/admin/TranscriptManager";
export const metadata: Metadata = { title: "Media intelligence · Admin", robots: { index: false, follow: false } };
export default function MediaIntelligencePage() {
  return <div className="min-h-[var(--page-min-height)] bg-secondary pb-24">
    <AdminPageHeader eyebrow="Media intelligence" title="Evidence before intelligence" supporting="Review authorized transcripts and publish real, timestamped moments to search. Public content stays free." />
    <div className="mx-auto max-w-container px-6 md:px-8"><TranscriptManager /></div>
  </div>;
}
