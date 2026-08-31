import type { SocialPlatform } from "@/components/feed/types";

export type SocialContentType = "live" | "video" | "short" | "photo" | "post";
export type AlertOrientation = "landscape" | "portrait" | "square";

export type SocialAlert = {
  id: string;
  eventId: string;
  provider: SocialPlatform | "twitch";
  memberSlug: string | null;
  contentType: SocialContentType;
  title: string;
  body: string | null;
  avatarUrl: string | null;
  href: string;
  artworkUrl: string | null;
  orientation: AlertOrientation | null;
  publishedAt: string;
  read: boolean;
};

export function socialAlertLabel(alert: Pick<SocialAlert, "contentType" | "provider">): string {
  if (alert.contentType === "live") return "Just went live";
  if (alert.contentType === "short") return alert.provider === "instagram" ? "New Reel" : "New short";
  if (alert.contentType === "photo") return "New photo";
  if (alert.contentType === "post") return "New post";
  return "New video";
}

export function socialAlertPrimaryAction(alert: Pick<SocialAlert, "contentType">): string {
  if (alert.contentType === "live") return "Switch to live";
  if (alert.contentType === "short") return "Watch short";
  if (alert.contentType === "photo") return "View post";
  if (alert.contentType === "post") return "Open post";
  return "Watch now";
}
