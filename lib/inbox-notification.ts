export const INBOX_CATEGORIES = ["creator", "reminder", "account", "community"] as const;

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
};

export type NotificationCenterPage = {
  items: InboxNotification[];
  unreadCount: number;
  nextCursor: string | null;
};

export function isInboxCategory(value: string | null | undefined): value is InboxCategory {
  return typeof value === "string" && (INBOX_CATEGORIES as readonly string[]).includes(value);
}
