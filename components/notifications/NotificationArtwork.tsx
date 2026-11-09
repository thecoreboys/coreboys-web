"use client";

import { Bell } from "lucide-react";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { WatchThumb } from "@/components/watch/WatchThumb";
import { notificationArtworkSource } from "@/lib/notification-artwork";
import type { NotificationProvider } from "@/lib/notification-target";
import styles from "./NotificationArtwork.module.css";

export function NotificationArtwork({ href, imageUrl, avatarUrl, provider, orientation, variant = "compact" }: {
  href: string;
  imageUrl?: string | null;
  avatarUrl?: string | null;
  provider?: NotificationProvider;
  orientation?: "landscape" | "portrait" | "square" | null;
  variant?: "compact" | "feed" | "tray";
}) {
  const source = notificationArtworkSource({ href, imageUrl, avatarUrl, provider, orientation });
  const mark = source.provider === "core" || source.provider === "web" || source.provider === "house"
    ? <Bell size={18} aria-hidden />
    : <SocialIcon platform={source.provider} size={18} />;
  const fallback = <span className={styles.fallback}>{avatarUrl ? <span className={styles.avatar}><WatchThumb src={avatarUrl} alt="" className={styles.image} sizes="40px" referrerPolicy="no-referrer" placeholder={mark} fallback={mark} /></span> : mark}</span>;
  const size = variant === "tray" ? source.orientation === "portrait" ? "48px" : source.orientation === "square" ? "72px" : "96px" : variant === "feed" ? "56px" : "40px";
  return (
    <span className={styles.frame} data-notification-artwork data-variant={variant} data-orientation={source.orientation} aria-hidden="true">
      <WatchThumb {...source} alt="" className={styles.image} sizes={size} referrerPolicy="no-referrer" placeholder={fallback} fallback={fallback} />
    </span>
  );
}
