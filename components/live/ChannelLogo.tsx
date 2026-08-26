"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/base/avatar/avatar";

export type ChannelLogoProps = {
  name: string;
  logoUrl?: string;
  logoName?: string;
  avatarUrl?: string;
  size?: "xs" | "sm" | "md";
  className?: string;
};

const logoSizes = {
  xs: "h-6 w-9 rounded-md p-1",
  sm: "h-8 w-12 rounded-lg p-1.5",
  md: "h-10 w-14 rounded-lg p-2",
} as const;

const avatarSizes = {
  xs: "xs",
  sm: "sm",
  md: "md",
} as const;

function logoScale(name?: string): number {
  switch (name?.toLowerCase()) {
    case "m3":
      return 1.45;
    case "flock":
      return 1.4;
    case "stable":
    case "thugs":
    case "nms":
    case "slg":
      return 1.05;
    default:
      return 1;
  }
}

/** A channel's own mark, with its Twitch avatar as the guest/error fallback. */
export function ChannelLogo({
  name,
  logoUrl,
  logoName,
  avatarUrl,
  size = "xs",
  className = "",
}: ChannelLogoProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  if (logoUrl && !logoFailed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-black ring-1 ring-inset ring-white/10 ${logoSizes[size]} ${className}`}
        title={logoName ? `${logoName} channel` : `${name} channel`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          className="comm-logo size-full object-contain"
          style={{ transform: `scale(${logoScale(logoName)})`, transformOrigin: "center" }}
          loading="lazy"
          decoding="async"
          onError={() => setLogoFailed(true)}
        />
      </span>
    );
  }

  return (
    <Avatar
      size={avatarSizes[size]}
      src={avatarUrl}
      alt=""
      initials={name.trim().charAt(0) || "?"}
      className={className}
    />
  );
}
