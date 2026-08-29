import type { Metadata } from "next";
import { CoreWordmark } from "@/components/brand/CoreWordmark";
import { AccessGateIntro } from "./AccessGateIntro";
import { AccessGateForm } from "./AccessGateForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Private preview",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
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
