import type { Metadata } from "next";
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
      <div className="access-gate-scan" aria-hidden />
      <div className="access-gate-orbit access-gate-orbit-one" aria-hidden />
      <div className="access-gate-orbit access-gate-orbit-two" aria-hidden />
      <section className="access-gate-card" aria-labelledby="access-gate-title">
        <p className="access-gate-eyebrow"><span aria-hidden /> Private preview</p>
        <h1 id="access-gate-title">CORE is behind the curtain.</h1>
        <p className="access-gate-copy">Enter the preview code to continue.</p>
        <AccessGateForm next={params.next ?? null} />
      </section>
    </main>
  );
}
