import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { RadioControlRoom } from "@/components/admin/RadioControlRoom";
import { getDjCoraElevenLabsVoiceId } from "@/lib/radio/dj-cora-voice";

export const metadata: Metadata = { title: "DJ Cora · Admin", robots: { index: false, follow: false } };

export default function RadioAdminPage() {
  const elevenLabsVoiceId = getDjCoraElevenLabsVoiceId();

  return (
    <AuthGate>
      <main className="min-h-screen bg-secondary pb-24 pt-20 md:pt-24">
        <AdminPageHeader eyebrow="DJ Cora control room" title="Cue library & joke book" supporting="Manage comedy context, review AI-written drafts, and approve recorded station cues. Playback selects a saved asset only—there is no per-listener speech generation." />
        <div className="mx-auto max-w-container px-6 md:px-8"><RadioControlRoom elevenLabsVoiceId={elevenLabsVoiceId} /></div>
      </main>
    </AuthGate>
  );
}
