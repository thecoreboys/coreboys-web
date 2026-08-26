/**
 * Canonical CORE targets we measure a connected fan against.
 * Handles come from @coreboys/shared + the house GROUP record.
 */
import { MEMBERS } from "@/lib/members";
import { GROUP } from "@/lib/group";

export type RosterTarget = {
  slug: string;
  label: string;
  twitchLogin: string | null;
  youtubeHandles: string[];
  youtubeChannelIds: string[];
  xHandle: string | null;
};

function bare(handle: string | undefined | null): string | null {
  if (!handle) return null;
  return handle.replace(/^@/, "").toLowerCase();
}

export function houseTarget(): RosterTarget {
  return {
    slug: "house",
    label: GROUP.name,
    twitchLogin: null,
    youtubeHandles: GROUP.socials.youtube.handle
      ? [GROUP.socials.youtube.handle.replace(/^@/, "")]
      : [],
    youtubeChannelIds: GROUP.socials.youtube.channelId ? [GROUP.socials.youtube.channelId] : [],
    xHandle: bare(GROUP.socials.x.handle),
  };
}

export function memberTargets(): RosterTarget[] {
  return MEMBERS.map((m) => {
    const yt = m.socials.filter((s) => s.platform === "youtube");
    const x = m.socials.find((s) => s.platform === "x");
    const ids: string[] = [];
    if (m.youtubeChannelId) ids.push(m.youtubeChannelId);
    return {
      slug: m.slug,
      label: m.stageName,
      twitchLogin: m.twitchLogin.toLowerCase(),
      youtubeHandles: yt
        .map((s) => bare(s.handle) ?? "")
        .filter(Boolean),
      youtubeChannelIds: ids,
      xHandle: bare(x?.handle ?? null),
    };
  });
}

export function allTargets(): RosterTarget[] {
  return [houseTarget(), ...memberTargets()];
}

/** Official X profile targets. These are intentionally not called Communities. */
export const X_PROFILE_TARGETS: ReadonlyArray<{
  id: string;
  name: string;
  profileUrl: string;
}> = allTargets().flatMap((target) => target.xHandle ? [{
  id: target.slug,
  name: `${target.label} on X`,
  profileUrl: `https://x.com/${target.xHandle}`,
}] : []);
