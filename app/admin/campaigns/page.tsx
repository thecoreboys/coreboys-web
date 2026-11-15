import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CampaignManager } from "@/components/admin/CampaignManager";

export const metadata: Metadata = { title: "Clipping campaigns · Admin", robots: { index: false, follow: false } };

export default function CampaignsAdminPage() {
  return <AuthGate><div className="min-h-[var(--page-min-height)] bg-secondary pb-24">
    <AdminPageHeader eyebrow="The clipping room" title="Your clips. Your coin." supporting="Choose the campaigns, artwork, placements and dates. Ads disappear automatically when their display window or campaign ends." />
    <div className="mx-auto max-w-container px-6 md:px-8"><CampaignManager /></div>
  </div></AuthGate>;
}
