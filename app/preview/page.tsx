import type { Metadata } from "next";
import { NotificationPreviewSurface } from "@/components/notifications/NotificationContentPreview";
import { notificationPreviewDataFromSearchParams } from "@/lib/notification-target";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Content preview",
  description: "Preview shared creator content inside CORE.",
  robots: { index: false, follow: false },
};

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; title?: string; body?: string; image?: string; avatar?: string }>;
}) {
  const params = await searchParams;
  const preview = notificationPreviewDataFromSearchParams(params);
  return (
    <main className="min-h-dvh bg-[#060607] px-4 py-12 text-white sm:px-6 sm:py-20">
      <div className="mx-auto max-w-3xl">
        {preview ? (
          <NotificationPreviewSurface preview={preview} fullPage />
        ) : (
          <section className="rounded-3xl border border-white/10 bg-[#111116] px-6 py-14 text-center shadow-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Preview unavailable</p>
            <h1 className="mt-3 text-2xl font-semibold">This link can’t be previewed here.</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/55">Return to your notifications and choose another update.</p>
          </section>
        )}
      </div>
    </main>
  );
}
