export const INBOX_CATEGORIES = ["creator", "reminder", "account", "community"] as const;

export type NotificationLinkPreview = {
  href: string;
  label?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
};

export type NotificationQuotedPost = {
  statusUrl: string;
  text: string;
  authorName?: string;
  authorHandle: string;
  authorProfileUrl: string;
  authorAvatarUrl?: string;
  links: NotificationLinkPreview[];
  media: Array<{ thumbnailUrl: string; kind: "image" | "video"; width?: number; height?: number }>;
};

/** Durable, render-safe X snapshot attached to a creator notification. */
export type NotificationXPost = {
  text: string;
  sourceUrl: string;
  authorName: string;
  authorHandle: string;
  authorProfileUrl: string;
  authorAvatarUrl?: string;
  verified?: boolean;
  links: NotificationLinkPreview[];
  media: Array<{ thumbnailUrl: string; kind: "image" | "video"; width?: number; height?: number }>;
  quote?: NotificationQuotedPost;
};

export type InboxCategory = (typeof INBOX_CATEGORIES)[number];

export type InboxNotification = {
  id: string;
  category: InboxCategory;
  title: string;
  body: string | null;
  href: string;
  imageUrl: string | null;
  avatarUrl: string | null;
  createdAt: string;
  readAt: string | null;
  xPost?: NotificationXPost | null;
};

export type NotificationCenterPage = {
  items: InboxNotification[];
  unreadCount: number;
  nextCursor: string | null;
};

export function isInboxCategory(value: string | null | undefined): value is InboxCategory {
  return typeof value === "string" && (INBOX_CATEGORIES as readonly string[]).includes(value);
}
