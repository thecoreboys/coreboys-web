import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { LogoSubmissionsReviewer } from "@/components/admin/LogoSubmissionsReviewer";
export const metadata: Metadata = { title: "Admin · Logo submissions", robots: { index: false, follow: false } };
export default function AdminLogoSubmissionsPage(){return <AuthGate><div className="min-h-[var(--page-min-height)] bg-secondary"><AdminPageHeader eyebrow="Admin · Logo archive" title="Review submissions." supporting="Preview the work, edit its public credit and copy, then decide which files should be visible."/><section className="border-t border-secondary"><div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14"><LogoSubmissionsReviewer/></div></section></div></AuthGate>;}
