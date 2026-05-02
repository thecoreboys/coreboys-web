import type { Metadata } from "next";
import { LinksClient } from "./LinksClient";
import { MEMBERS } from "@/lib/members";
import { GROUP_SOCIALS } from "@coreboys/shared";

export const metadata: Metadata = {
  title: "Links",
  description:
    "Every Core Boys channel — Marlon, StableRonaldo, Adapt, JasonTheWeen, Lacy, Silky — plus the org socials. Live status updates every 60s.",
  alternates: { canonical: "/links" },
  openGraph: {
    title: "The Core Boys — links",
    description:
      "Every Core Boys channel — live status, socials, and group accounts in one place.",
    url: "/links",
    type: "website",
  },
};

/**
 * /links — the linktree-style hub. Server-renders the static composition;
 * the live state and expand/collapse interactivity is in the client child.
 */
export default function LinksPage() {
  // Surface the data the client component needs without round-tripping
  // through the api — it all lives in @coreboys/shared.
  const members = MEMBERS.map((m) => ({
    slug: m.slug,
    name: m.stageName,
    realName: m.realName,
    accent: m.accent,
    portrait: m.portrait,
    twitchLogin: m.twitchLogin,
    socials: m.socials,
  }));
  const groupSocials = GROUP_SOCIALS.map((s) => ({
    platform: s.platform,
    url: s.url,
    handle: s.handle ?? null,
    label: s.label ?? null,
  }));

  return <LinksClient members={members} groupSocials={groupSocials} />;
}
