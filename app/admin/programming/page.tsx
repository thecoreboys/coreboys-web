import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { WatchProgrammingManager } from "@/components/admin/WatchProgrammingManager";

export const metadata: Metadata = { title: "Watch programming · Admin", robots: { index: false, follow: false } };

export default function WatchProgrammingAdminPage() {
  return <AuthGate><div className="min-h-[var(--page-min-height)] bg-secondary pb-24"><AdminPageHeader eyebrow="Watch control room" title="Community programming" supporting="Add outside channels, route each source into exact CORE or member Videos, Shorts, and 24/7 lanes, curate specific videos, and build homepage rails or hero picks." /><div className="mx-auto max-w-container px-6 md:px-8"><WatchProgrammingManager /></div></div></AuthGate>;
}
