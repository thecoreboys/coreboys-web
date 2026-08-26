import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock01 } from "@untitledui/icons";
import { SiteFooter } from "@/components/chrome/SiteFooter";

export const metadata: Metadata = {
  title: "Postcard studio paused",
  description: "The online postcard studio is temporarily unavailable.",
  alternates: { canonical: "/fan-mail/postcard" },
};

export const dynamic = "force-dynamic";

export default function PostcardPage() {
  return (
    <>
      <div className="fan-mail-shell relative min-h-screen pb-24 pt-24 md:pt-28">
        <div className="mx-auto max-w-container px-6 md:px-8">
          <Link
            href="/fan-mail"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-tertiary transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-4" /> Fan mail
          </Link>

          <section className="mt-10 grid min-h-[min(32rem,60vh)] place-items-center rounded-3xl border border-white/10 bg-black/20 px-6 text-center shadow-2xl backdrop-blur-sm">
            <div className="max-w-md">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-brand-solid/35 bg-brand-solid/10 text-brand-secondary">
                <Lock01 className="size-6" />
              </span>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-brand-secondary">Temporarily locked</p>
              <h1 className="mt-3 text-display-sm font-semibold tracking-tight text-primary md:text-display-md">Postcard studio is taking a pause.</h1>
              <p className="mt-4 text-base leading-relaxed text-tertiary">Online postcard design and checkout are unavailable for now. Fan mail addresses are still open.</p>
              <Link href="/fan-mail" className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-on-brand transition hover:opacity-90">
                View mailing addresses
              </Link>
            </div>
          </section>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
