import type { Metadata } from "next";
import { MEMBERS } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { ClipSubmitForm } from "@/components/clips/ClipSubmitForm";

export const metadata: Metadata = {
  title: "Submit a clip — The Core Boys",
  description: "Send a viral clip our way. Twitch, YouTube, TikTok, Instagram.",
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
    <main className="relative pt-20 md:pt-24">
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 40% at 30% 30%, rgba(239,68,68,0.10), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-[720px] px-6 py-14 md:px-8 md:py-20">
          <p className="eyebrow">Community · Submit</p>
          <h1 className="mt-2 text-display text-[clamp(36px,5vw,64px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
            Found a viral clip? <span className="gradient-text">Send it in.</span>
          </h1>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[color:var(--ink-dim)]">
            Twitch clips, YouTube shorts, TikToks, Instagram reels. Drop a link, tag the boys in
            it, and we&apos;ll review it for the public clips library.
          </p>

          <div className="mt-8 overflow-hidden rounded-2xl border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]">
            <ClipSubmitForm members={memberOptions} />
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
