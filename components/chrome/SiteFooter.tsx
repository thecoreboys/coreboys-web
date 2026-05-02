import Link from "next/link";
import { Instagram, Youtube } from "lucide-react";
import { PlatformLogo } from "@/components/clips/PlatformLogo";
import { MEMBERS } from "@/lib/members";

type SocialIcon = React.ComponentType<{ size?: number }>;

const TikTokIcon: SocialIcon = ({ size = 14 }) => <PlatformLogo platform="tiktok" size={size} />;
const XIcon: SocialIcon = ({ size = 14 }) => <PlatformLogo platform="x" size={size} />;

const SOCIALS: Array<{ label: string; url: string; Icon: SocialIcon }> = [
  { label: "YouTube", url: "https://www.youtube.com/@createownruneverything", Icon: Youtube },
  { label: "TikTok", url: "https://www.tiktok.com/@officialcoreboys", Icon: TikTokIcon },
  { label: "Instagram", url: "https://www.instagram.com/createownruneverything", Icon: Instagram },
  { label: "X", url: "https://x.com/thecoreboys", Icon: XIcon },
];

const SITE_LINKS: { label: string; href: string }[] = [
  { label: "Media", href: "/media" },
  { label: "News", href: "/news" },
  { label: "Fanzone", href: "/fanzone" },
  { label: "Live chat", href: "/chat" },
];

const LEGAL_LINKS: { label: string; href: string }[] = [
  { label: "Terms of service", href: "/legal/terms" },
  { label: "Privacy policy", href: "/legal/privacy" },
  { label: "Cookie policy", href: "/legal/cookies" },
];

/**
 * Structured corporate footer. Four columns: brand, roster, site links,
 * legal. A bottom bar with copyright + status pill + credit.
 */
export function SiteFooter() {
  return (
    <footer className="relative border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
      <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-8 md:py-20">
        <div className="grid grid-cols-12 gap-8 md:gap-12">
          {/* Brand */}
          <div className="col-span-12 md:col-span-4">
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="font-logo text-[28px] leading-none text-[color:var(--ink)]">
                CORE
              </span>
            </Link>
            <p className="mt-4 max-w-[36ch] text-[13px] font-semibold leading-relaxed text-[color:var(--ink)]">
              Create. Own. <span className="text-[color:var(--core)]">Run Everything.</span>
            </p>
            <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-[color:var(--ink-dim)]">
              Six creators, one house — built, owned and run by the people on screen.
            </p>

            <ul className="mt-6 flex items-center gap-2">
              {SOCIALS.map(({ label, url, Icon }) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`CORE on ${label}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] transition-colors hover:border-[color:var(--rule-strong)] hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)]"
                  >
                    <Icon size={14} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Roster */}
          <div className="col-span-6 md:col-span-3">
            <p className="eyebrow">Roster</p>
            <ul className="mt-4 flex flex-col gap-2">
              {MEMBERS.map((m) => (
                <li key={m.slug}>
                  <Link
                    href={`/m/${m.slug}` as `/m/${string}`}
                    className="text-[13px] font-medium text-[color:var(--ink-dim)] transition-colors hover:text-[color:var(--ink)]"
                  >
                    {m.stageName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Site */}
          <div className="col-span-6 md:col-span-2">
            <p className="eyebrow">Site</p>
            <ul className="mt-4 flex flex-col gap-2">
              {SITE_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href as never}
                    className="text-[13px] font-medium text-[color:var(--ink-dim)] transition-colors hover:text-[color:var(--ink)]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div className="col-span-12 md:col-span-3">
            <p className="eyebrow">Legal</p>
            <ul className="mt-4 flex flex-col gap-2">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href as never}
                    className="text-[13px] font-medium text-[color:var(--ink-dim)] transition-colors hover:text-[color:var(--ink)]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-[color:var(--rule)] pt-6 md:mt-16 md:flex-row md:items-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
            © {new Date().getFullYear()} · Unofficial site · Not affiliated with Core
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://mdcran.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)] hover:text-[color:var(--ink)]"
            >
              Built by MDCran ↗
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
