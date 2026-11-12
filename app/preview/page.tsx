import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { NotificationPreviewSurface } from "@/components/notifications/NotificationContentPreview";
import { notificationPreviewDataFromSearchParams } from "@/lib/notification-target";

export const dynamic = "force-dynamic";
export const metadata: Metadata = withPageMetadata("/preview", {
  title: "Content preview",
  description: "Preview shared creator content inside CORE.",
  robots: { index: false, follow: false },
});

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; title?: string; body?: string; image?: string; avatar?: string }>;
}) {
  const params = await searchParams;
  const preview = notificationPreviewDataFromSearchParams(params);
  return (
    <div className="min-h-dvh bg-primary px-4 py-12 text-primary sm:px-6 sm:py-20">
      <div className="mx-auto max-w-3xl">
        {preview ? (
          <NotificationPreviewSurface preview={preview} fullPage />
        ) : (
          <section className="rounded-3xl border border-secondary bg-secondary px-6 py-14 text-center shadow-lg">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-tertiary">Preview unavailable</p>
            <h1 className="mt-3 text-2xl font-semibold">This link can’t be previewed here.</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-tertiary">Return to your notifications and choose another update.</p>
          </section>
        )}
      </div>
    </div>
  );
}
