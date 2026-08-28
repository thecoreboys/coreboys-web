import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Announcement02,
  Heart,
  Image01,
  UserPlus01,
  Users01,
  Film01,
  BarChart01,
  Link01,
  Mail01,
  Trophy01,
} from "@untitledui/icons";
import { AuthGate, SignOutButton } from "@/components/admin/AuthGate";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const TILES = [
  {
    href: "/admin/ai-usage",
    title: "AI usage controls",
    desc: "Set hard provider limits, monthly spend caps, per-user safeguards, and emergency AI kill switches.",
    Icon: BarChart01,
  },
  {
    href: "/admin/social-fetch",
    title: "Social feed credits",
    desc: "Pause paid TikTok, Instagram, and X discovery, set a hard monthly credit cap, and inspect private usage.",
    Icon: BarChart01,
  },
  {
    href: "/admin/originals",
    title: "CORE Originals",
    desc: "Control events, series, challenges, home posters, and the approval-only recommendation queue.",
    Icon: Film01,
  },
  {
    href: "/admin/programming",
    title: "Watch programming",
    desc: "Add community channels, route content into network lanes, curate homepage rails, and feature hero videos.",
    Icon: Film01,
  },
  {
    href: "/admin/radio",
    title: "DJ Cora control room",
    desc: "Approve recorded station IDs, rotate tune-ins, and manage 24/7 live-takeover cues without per-listener generation.",
    Icon: Announcement02,
  },
  {
    href: "/admin/passport",
    title: "CORE Passport control room",
    desc: "Run channel roles, live events, polls, verified scores, Moment Cards, rewards, and appeals.",
    Icon: Trophy01,
  },
  {
    href: "/admin/accounts",
    title: "Staff accounts",
    desc: "Create admins and assign member managers to one community Studio.",
    Icon: Users01,
  },
  {
    href: "/admin/photos",
    title: "Photos",
    desc: "Upload, manually tag people, edit metadata, set credits.",
    Icon: Image01,
  },
  {
    href: "/admin/clips",
    title: "Clips",
    desc: "Add a Twitch / YouTube / TikTok / IG clip directly, or review and publish fan submissions.",
    Icon: Film01,
  },
  {
    href: "/admin/polls",
    title: "Polls",
    desc: "Create community polls, open or close voting, and watch live results roll in.",
    Icon: BarChart01,
  },
  {
    href: "/admin/articles",
    title: "Articles",
    desc: "Write, edit, and publish editorial — rich text, embeds, image gallery, callouts, drafts.",
    Icon: Announcement02,
  },
  {
    href: "/admin/people",
    title: "Members & crew",
    desc: "Names, aliases, DOB, comms, heights, bios, dynamic social links, gallery picks.",
    Icon: Users01,
  },
  {
    href: "/admin/talents",
    title: "Talents",
    desc: "Tag external creators by Twitch handle so they're linkable in articles + clips.",
    Icon: UserPlus01,
  },
  {
    href: "/admin/faces",
    title: "On-screen people",
    desc: "Manage adult consent, protected enrollment, authorized video sources, review, publishing, and deletion.",
    Icon: UserPlus01,
  },
  {
    href: "/admin/fanzone",
    title: "Fanzone review",
    desc: "Approve / deny photos submitted to the fan wall.",
    Icon: Heart,
  },
  {
    href: "/admin/postcards",
    title: "Postcard review",
    desc: "Inspect paid custom artwork before mailing, or decline and refund it.",
    Icon: Mail01,
  },
  {
    href: "/admin/fans",
    title: "Connected fans",
    desc: "Signups vs linked Twitch / YouTube / X, overlap, dark fans. Org-level only.",
    Icon: Link01,
  },
  {
    href: "/admin/x",
    title: "X curation & usage",
    desc: "Review nominated posts and monitor official embeds, cache health, API credits, and the monthly safety gate.",
    Icon: Link01,
  },
];

export default function AdminHome() {
  return (
    <AuthGate>
      <main className="relative min-h-screen bg-secondary pt-20 md:pt-24">
        <section className="relative overflow-hidden">
          <div className="relative mx-auto max-w-container px-6 py-12 md:px-8 md:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">CORE · Desk</p>
                <h1 className="mt-2 font-display text-[32px] font-semibold tracking-[-0.03em] text-[color:var(--ink)] md:text-[48px]">
                  Today.
                </h1>
                <p className="mt-3 max-w-[60ch] text-base text-[color:var(--ink-dim)]">
                  Photos, cuts, copy, people, mail.
                </p>
              </div>
              <SignOutButton />
            </div>
          </div>
        </section>

        <section className="border-t border-secondary">
          <div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14">
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {TILES.map(({ href, title, desc, Icon }) => (
                <li key={href}>
                  <Link
                    href={href as never}
                    className="group flex h-full flex-col gap-4 rounded-xl bg-primary p-6 ring-1 ring-inset ring-secondary shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <FeaturedIcon icon={Icon} size="lg" color="brand" theme="modern" />
                    <div>
                      <p className="text-lg font-semibold tracking-tight text-primary">{title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-tertiary">{desc}</p>
                    </div>
                    <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-secondary group-hover:text-brand-secondary_hover">
                      Open <ArrowUpRight className="size-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
