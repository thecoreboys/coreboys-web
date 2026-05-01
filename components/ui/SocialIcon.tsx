"use client";

import {
  siYoutube,
  siTiktok,
  siInstagram,
  siTwitch,
  siX,
  siSnapchat,
  siWikipedia,
} from "simple-icons";
import { cn } from "@/lib/utils";

type Platform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "twitch"
  | "x"
  | "snapchat"
  | "wikipedia";

const ICON_BY_PLATFORM: Record<Platform, { path: string; title: string }> = {
  youtube: { path: siYoutube.path, title: siYoutube.title },
  tiktok: { path: siTiktok.path, title: siTiktok.title },
  instagram: { path: siInstagram.path, title: siInstagram.title },
  twitch: { path: siTwitch.path, title: siTwitch.title },
  x: { path: siX.path, title: siX.title },
  snapchat: { path: siSnapchat.path, title: siSnapchat.title },
  wikipedia: { path: siWikipedia.path, title: siWikipedia.title },
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  twitch: "Twitch",
  x: "X",
  snapchat: "Snapchat",
  wikipedia: "Wikipedia",
};

export function SocialIcon({
  platform,
  size = 18,
  className,
}: {
  platform: Platform;
  size?: number;
  className?: string;
}) {
  const icon = ICON_BY_PLATFORM[platform];
  return (
    <svg
      role="img"
      aria-label={icon.title}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("fill-current", className)}
    >
      <title>{icon.title}</title>
      <path d={icon.path} />
    </svg>
  );
}
