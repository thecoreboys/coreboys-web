import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { WatchProgrammingManager } from "@/components/admin/WatchProgrammingManager";

export const metadata: Metadata = { title: "Watch programming · Admin", robots: { index: false, follow: false } };

export default function WatchProgrammingAdminPage() {
  return <AuthGate><main className="min-h-screen bg-secondary pb-24 pt-20 md:pt-24"><AdminPageHeader eyebrow="Watch control room" title="Community programming" supporting="Add outside channels, route each source into exact CORE or member Videos, Shorts, and 24/7 lanes, curate specific videos, and build homepage rails or hero picks." /><div className="mx-auto max-w-container px-6 md:px-8"><WatchProgrammingManager /></div></main></AuthGate>;
}
