import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { RadioControlRoom } from "@/components/admin/RadioControlRoom";
import { getDjCoraElevenLabsVoiceId } from "@/lib/radio/dj-cora-voice";

export const metadata: Metadata = withPageMetadata("/admin/radio", {
  title: "DJ Cora · Admin",
  robots: { index: false, follow: false },
  description: "Private CORE staff tools. Staff sign-in is required to manage site content and settings.",
});

export default function RadioAdminPage() {
  const elevenLabsVoiceId = getDjCoraElevenLabsVoiceId();

  return (
    <AuthGate>
      <div className="min-h-[var(--page-min-height)] bg-secondary pb-24">
        <AdminPageHeader eyebrow="DJ Cora control room" title="Cue library & joke book" supporting="Manage comedy context, review AI-written drafts, and approve recorded station cues. Playback selects a saved asset only—there is no per-listener speech generation." />
        <div className="mx-auto max-w-container px-6 md:px-8"><RadioControlRoom elevenLabsVoiceId={elevenLabsVoiceId} /></div>
      </div>
    </AuthGate>
  );
}
