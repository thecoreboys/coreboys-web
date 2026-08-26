import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CoreOriginalsManager } from "@/components/admin/CoreOriginalsManager";
export const metadata: Metadata = { title: "CORE Originals · Admin", robots: { index: false, follow: false } };
export default function CoreOriginalsAdminPage() { return <AuthGate><main className="min-h-screen bg-secondary pb-24 pt-20 md:pt-24"><AdminPageHeader eyebrow="CORE Originals" title="Events, series & challenges" supporting="Create collections, control the home posters, add approved content, and review catalog recommendations before they go live." /><div className="mx-auto max-w-container px-6 md:px-8"><CoreOriginalsManager /></div></main></AuthGate>; }
