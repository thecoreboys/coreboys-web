import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/chrome/SiteFooter";

export const metadata: Metadata = {
  title: "Page not found",
  description: "This room doesn’t exist.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <>
      <section className="relative flex min-h-[70svh] items-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/group/thecoreboys.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 60% at 50% 40%, rgba(8,8,10,0.4) 0%, rgba(8,8,10,0.88) 100%)",
          }}
        />
        <div className="relative mx-auto max-w-2xl px-6 py-24 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/55">404</p>
          <h1 className="mt-4 font-display text-[32px] font-semibold tracking-[-0.03em] text-white md:text-[48px]">
            This room doesn’t exist.
          </h1>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-8 font-mono text-xs uppercase tracking-[0.18em] text-white">
            <Link href="/" className="hover:underline">
              House
            </Link>
            <Link href="/#members" className="hover:underline">
              The six
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
