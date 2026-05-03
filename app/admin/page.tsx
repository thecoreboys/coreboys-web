import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FileText, Heart, Image as ImageIcon, UserPlus, Users, Video } from "lucide-react";
import { AuthGate, SignOutButton } from "@/components/admin/AuthGate";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const TILES = [
  {
    href: "/admin/photos",
    title: "Photos",
    desc: "Upload, manually tag people, edit metadata, set credits.",
    Icon: ImageIcon,
  },
  {
    href: "/admin/clips",
    title: "Clips",
    desc: "Add a Twitch / YouTube / TikTok / IG clip directly, or review and publish fan submissions.",
    Icon: Video,
  },
  {
    href: "/admin/articles",
    title: "Articles",
    desc: "Write, edit, and publish editorial — rich text, embeds, image gallery, callouts, drafts.",
    Icon: FileText,
  },
  {
    href: "/admin/people",
    title: "Members & crew",
    desc: "Names, aliases, DOB, comms, heights, bios, dynamic social links, gallery picks.",
    Icon: Users,
  },
  {
    href: "/admin/talents",
    title: "Talents",
    desc: "Tag external creators by Twitch handle so they're linkable in articles + clips.",
    Icon: UserPlus,
  },
  {
    href: "/admin/fanzone",
    title: "Fanzone review",
    desc: "Approve / deny photos submitted to the fan wall.",
    Icon: Heart,
  },
];

export default function AdminHome() {
  return (
    <AuthGate>
      <main className="relative pt-20 md:pt-24">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: "radial-gradient(60% 50% at 25% 30%, rgba(239,68,68,0.10), transparent 60%)",
            }}
          />
          <div className="relative mx-auto max-w-[1440px] px-6 py-12 md:px-8 md:py-16">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">CORE · Admin</p>
                <h1 className="mt-2 text-display text-[clamp(36px,5vw,56px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
                  Admin console.
                </h1>
                <p className="mt-3 max-w-[60ch] text-[14px] text-[color:var(--ink-dim)]">
                  Photos, clips, articles, members, and fanzone review.
                </p>
              </div>
              <SignOutButton />
            </div>
          </div>
        </section>

        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {TILES.map(({ href, title, desc, Icon }) => (
                <li key={href}>
                  <Link
                    href={href as never}
                    className="group flex h-full flex-col gap-3 rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-5 transition-colors hover:border-[color:var(--rule-strong)] hover:bg-[color:var(--surface)]"
                  >
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[color:var(--core)]/14 text-[color:var(--core)]">
                      <Icon size={18} />
                    </span>
                    <div>
                      <p className="text-[15px] font-semibold tracking-tight text-[color:var(--ink)]">
                        {title}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--ink-dim)]">
                        {desc}
                      </p>
                    </div>
                    <span className="mt-auto inline-flex items-center gap-1 text-[12px] font-medium text-[color:var(--ink-dim)] group-hover:text-[color:var(--core)]">
                      Open <ArrowUpRight size={12} />
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
