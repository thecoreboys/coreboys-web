import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FileText, Image as ImageIcon, MessageSquareCode, ScanFace, UserPlus, Users, Video } from "lucide-react";
import { AuthGate, SignOutButton } from "@/components/admin/AuthGate";

export const metadata: Metadata = {
  title: "Admin — The Core Boys",
  robots: { index: false, follow: false },
};

const TILES = [
  {
    href: "/admin/photos",
    title: "Photos",
    desc: "Upload, tag faces, edit metadata, set credits.",
    Icon: ImageIcon,
  },
  {
    href: "/admin/clips",
    title: "Clip review queue",
    desc: "Approve / deny fan-submitted clips, then publish to the public library.",
    Icon: Video,
  },
  {
    href: "/admin/clips/new",
    title: "Add a clip directly",
    desc: "Paste a Twitch / YouTube / TikTok / Instagram URL — extract metadata + tag people.",
    Icon: Video,
  },
  {
    href: "/admin/articles",
    title: "Articles",
    desc: "Manage every article — search, preview, delete drafts.",
    Icon: FileText,
  },
  {
    href: "/admin/articles/new",
    title: "Write an article",
    desc: "Rich-text editor with headers, images, video embeds, and links.",
    Icon: FileText,
  },
  {
    href: "/admin/people",
    title: "Members & crew",
    desc: "Edit name, alias, DOB, comm, height, weight, nickname, fave game, bio.",
    Icon: Users,
  },
  {
    href: "/admin/talents",
    title: "Talents",
    desc: "Add tags by Twitch handle, or create manually with AI-discovered socials.",
    Icon: UserPlus,
  },
  {
    href: "/admin/faces",
    title: "Face recognition",
    desc: "Manage the Rekognition collection + detection queue for new photo uploads.",
    Icon: ScanFace,
  },
  {
    href: "/admin/chat-mod",
    title: "Chat moderation",
    desc: "Bans, slowmode, ingest health for the BTTV/7TV pipeline.",
    Icon: MessageSquareCode,
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
                  Photos, clips, articles, and people. All edits write to localStorage in this
                  Phase-1 stub; Phase 4 swaps to <code className="font-mono">coreboys-api</code>.
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
