import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PostcardBinder } from "@/components/fan-mail/PostcardBinder";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { getCurrentFanUserId } from "@/lib/fan-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Postcard binder",
  description: "Your private collection of server-issued CORE postcards.",
  alternates: { canonical: "/binder/postcards" },
  robots: { index: false, follow: false },
};

export default async function PostcardBinderPage() {
  if (!(await getCurrentFanUserId())) redirect("/login?next=/binder/postcards");
  return (
    <>
      <main className="min-h-screen pb-24 pt-24 md:pt-28">
        <div className="mx-auto max-w-container px-6 md:px-8">
          <Link href="/passport" className="text-sm font-semibold text-tertiary hover:text-primary">← CORE Passport</Link>
          <header className="mt-6 max-w-2xl">
            <p className="text-sm font-semibold text-brand-secondary">Private collection</p>
            <h1 className="mt-2 text-display-sm font-semibold tracking-tight text-primary md:text-display-md">Your postcard binder</h1>
            <p className="mt-3 text-lg text-tertiary">Chosen variants and server-issued serials from accepted live postcard orders.</p>
          </header>
          <div className="mt-10"><PostcardBinder /></div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
