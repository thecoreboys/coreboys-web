import type { Metadata } from "next";
import { MEMBERS } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { ClipSubmitForm } from "@/components/clips/ClipSubmitForm";

export const metadata: Metadata = {
  title: "Save a clip draft",
  description: "Prepare a clip draft from Twitch, YouTube, TikTok, or Instagram on your device.",
  alternates: { canonical: "/clips/submit" },
};

export default async function ClipSubmitPage() {
  let avatars: Record<string, string> = {};
  try {
    const users = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatars[login] = u.profile_image_url;
    }
  } catch {
    avatars = {};
  }

  const memberOptions = MEMBERS.map((m) => ({
    slug: m.slug,
    stageName: m.stageName,
    accent: m.accent,
    avatarUrl: avatars[m.twitchLogin.toLowerCase()],
  }));

  return (
    <div className="relative">
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 40% at 30% 30%, rgba(219,3,104,0.10), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-[720px] px-6 py-14 md:px-8 md:py-20">
          <p className="text-sm font-semibold text-brand-secondary">Community · Clip drafts</p>
          <h1 className="mt-2 text-display-sm font-semibold tracking-tight text-primary md:text-display-md">
            Save a clip for later.
          </h1>
          <p className="mt-3 max-w-[60ch] text-lg leading-relaxed text-tertiary">
            Add a link and tag the boys in it. Your draft stays in this browser;
            public clip submissions are not available yet.
          </p>

          <div className="mt-8 overflow-hidden rounded-2xl bg-primary shadow-xl ring-1 ring-inset ring-secondary">
            <ClipSubmitForm members={memberOptions} />
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
