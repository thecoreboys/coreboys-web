import { withPageMetadata } from "@/lib/seo";
import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { CoreWordmark } from "@/components/brand/CoreWordmark";
import { siteAccessGateEnabled } from "@/lib/site-access";
import { safeAuthNext } from "@/lib/auth/password-reset";
import { AccessGateIntro } from "./AccessGateIntro";
import { AccessGateForm } from "./AccessGateForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = withPageMetadata("/access", {
  title: "Private preview",
  robots: { index: false, follow: false, noarchive: true },
});

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  if (!siteAccessGateEnabled()) {
    const next = safeAuthNext(params.next);
    redirect((next.startsWith("/access") ? "/" : next) as Route);
  }
  return (
    <main className="access-gate-shell">
      <AccessGateIntro />
      <div className="access-gate-house-art" aria-hidden />
      <div className="access-gate-scan" aria-hidden />
      <div className="access-gate-orbit access-gate-orbit-one" aria-hidden />
      <div className="access-gate-orbit access-gate-orbit-two" aria-hidden />
      <section className="access-gate-card" aria-labelledby="access-gate-title">
        <CoreWordmark className="access-gate-wordmark" />
        <h1 id="access-gate-title" className="sr-only">Enter access code</h1>
        <p className="access-gate-eyebrow">Beta access</p>
        <p className="access-gate-copy">Enter the six-digit access code.</p>
        <AccessGateForm next={params.next ?? null} />
        <p className="access-gate-footnote">Your code is personal—please don&apos;t share it.</p>
      </section>
    </main>
  );
}
