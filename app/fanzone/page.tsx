import type { Metadata } from "next";
import { Heart, Mail } from "lucide-react";
import { MEMBERS } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { FanWallClient } from "@/components/fanzone/FanWallClient";
import { PoBoxCardClient } from "@/components/fanzone/PoBoxCardClient";

export const metadata: Metadata = {
  title: "Fanzone",
  description: "Send fan mail, submit fan photos, and see featured fan content from the CORE community.",
  alternates: { canonical: "/fanzone" },
};

export const revalidate = 600;

export default async function FanzonePage() {
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
    avatarUrl: m.portrait ?? avatars[m.twitchLogin.toLowerCase()],
  }));

  return (
    <main className="relative pt-20 md:pt-24">
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 40% at 25% 30%, rgba(239,68,68,0.12), transparent 60%), radial-gradient(45% 35% at 80% 100%, rgba(99,102,241,0.10), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="lens-flare h-[420px] w-[420px]"
          style={{ left: "12%", top: "15%", ["--flare" as string]: "rgba(239,68,68,0.45)" }}
        />
        <div className="relative mx-auto max-w-[1440px] px-6 py-16 md:px-8 md:py-20">
          <p className="eyebrow inline-flex items-center gap-2">
            <Heart size={11} />
            Community · Fanzone
          </p>
          <h1 className="mt-3 text-display text-[clamp(48px,7vw,96px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
            <span className="gradient-text">For the fans.</span>
          </h1>
          <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-[color:var(--ink-dim)] md:text-[17px]">
            Mail in a postcard or package. Submit a picture you took with one of the members to possibly get featured on the fan wall!
          </p>
        </div>
      </section>

      {/* PO box wall — top */}
      <section className="border-t border-[color:var(--rule)]">
        <div className="mx-auto max-w-[1440px] px-6 py-12 md:px-8 md:py-16">
          <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow inline-flex items-center gap-2">
                <Mail size={11} />
                Mail in
              </p>
              <h2 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-bold text-[color:var(--ink)]">
                PO box addresses.
              </h2>
              <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--ink-dim)]">
                Letters, postcards, fan art, packages. First-class postage. Mail is opened
                every Wednesday.
              </p>
            </div>
          </header>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {MEMBERS.map((m) => (
              <li key={m.slug}>
                <PoBoxCard
                  slug={m.slug}
                  stageName={m.stageName}
                  realName={m.realName}
                  accent={m.accent}
                  avatarUrl={m.portrait ?? avatars[m.twitchLogin.toLowerCase()]}
                  poBox={m.poBox ?? null}
                  commLogo={m.comm.logo}
                  commName={m.comm.name}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Fan wall + Have-a-photo trigger */}
      <section className="border-t border-[color:var(--rule)]">
        <div className="mx-auto max-w-[1440px] px-6 py-12 md:px-8 md:py-16">
          <FanWallClient memberOptions={memberOptions} />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function PoBoxCard({
  slug,
  stageName,
  realName,
  accent,
  avatarUrl,
  poBox,
  commLogo,
  commName,
}: {
  slug: string;
  stageName: string;
  realName?: string;
  accent: string;
  avatarUrl: string;
  poBox:
    | {
        recipient: string;
        lines: string[];
        city: string;
        region: string;
        postalCode: string;
        country: string;
      }
    | null;
  commLogo?: string;
  commName?: string;
}) {
  if (!poBox) {
    return (
      <div className="rounded-xl border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-5">
        <div className="flex items-center gap-3">
          <span
            className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-inset"
            style={{ ["--tw-ring-color" as string]: `${accent}66` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-[color:var(--ink)]">{stageName}</p>
            <p className="text-[11px] text-[color:var(--ink-faint)]">No public address yet</p>
          </div>
        </div>
      </div>
    );
  }
  const formatted = [
    poBox.recipient,
    ...poBox.lines,
    `${poBox.city}, ${poBox.region} ${poBox.postalCode}`,
    poBox.country,
  ].join("\n");

  return (
    <PoBoxCardClient
      slug={slug}
      stageName={stageName}
      realName={realName}
      accent={accent}
      avatarUrl={avatarUrl}
      formatted={formatted}
      commLogo={commLogo}
      commName={commName}
      poBox={poBox}
    />
  );
}
