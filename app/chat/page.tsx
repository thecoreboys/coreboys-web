import type { Metadata } from "next";
import Link from "next/link";
import { MEMBERS } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";
import { ChatHub, type ChatChannel } from "@/components/live/ChatHub";
import { SiteFooter } from "@/components/chrome/SiteFooter";

export const metadata: Metadata = {
  title: "Chat — The Core Boys",
  description: "Every CORE Twitch chat, side by side. Show, hide, or add channels — BTTV + 7TV emotes supported.",
  alternates: { canonical: "/chat" },
};

// Re-fetch the Twitch user lookup hourly. Numeric user IDs are stable;
// this just keeps a fresh edge cache.
export const revalidate = 3600;

export default async function ChatHubPage() {
  let coreChannels: ChatChannel[] = [];
  try {
    const users = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
    const built: ChatChannel[] = [];
    for (const m of MEMBERS) {
      const u = users[m.twitchLogin.toLowerCase()];
      if (!u) continue;
      built.push({
        login: u.login.toLowerCase(),
        userId: u.id,
        displayName: m.stageName,
        avatarUrl: u.profile_image_url,
        accent: m.accent,
        isCore: true,
        slug: m.slug,
        commLogo: m.comm.logo,
        commName: m.comm.name,
      });
    }
    coreChannels = built;
  } catch {
    coreChannels = [];
  }

  return (
    <main className="relative pt-20 md:pt-24">
      <section className="relative overflow-hidden bg-dot-grid">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 40% at 30% 30%, rgba(239,68,68,0.08), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-[1800px] px-6 py-12 md:px-8 md:py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Chat hub · Live</p>
              <h1 className="mt-2 text-display text-[clamp(36px,5vw,64px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
                Every chat, one room.
              </h1>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-dim)]">
                Supports Twitch · 7TV · BTTV emotes
              </p>
            </div>
            <Link
              href="/"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
            >
              ← Home
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
        <div className="mx-auto max-w-[1800px] px-4 py-8 md:px-8 md:py-12">
          {coreChannels.length === 0 ? (
            <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-8 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                Twitch credentials missing — chat hub disabled
              </p>
            </div>
          ) : (
            <ChatHub coreChannels={coreChannels} />
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
