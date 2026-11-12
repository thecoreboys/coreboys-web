import { withPageMetadata } from "@/lib/seo";

export const metadata = withPageMetadata("/account/notifications", {
  title: "Your Notifications",
  description: "View your private CORE notifications, live alerts, and account updates.",
  robots: { index: false, follow: false },
});

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
