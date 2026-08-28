import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AuthGate } from "@/components/admin/AuthGate";
import { SocialFetchControlRoom } from "@/components/admin/SocialFetchControlRoom";

export const metadata: Metadata = {
  title: "Admin · Social Fetch credits",
  robots: { index: false, follow: false },
};

export default function SocialFetchAdminPage() {
  return (
    <AuthGate>
      <main className="min-h-screen bg-secondary pt-20">
        <div className="mx-auto max-w-container px-6 py-10 md:px-8">
          <AdminPageHeader
            eyebrow="CORE · Social operations"
            title="Social Fetch credit controls"
            supporting="Pause paid TikTok, Instagram, and X history reads, set the hard UTC monthly credit cap, inspect private usage, and control the resumable six-month import. Public feeds continue using stored posts and official platform links or embeds when spending is stopped."
          />
          <div className="mt-8">
            <SocialFetchControlRoom />
          </div>
        </div>
      </main>
    </AuthGate>
  );
}
