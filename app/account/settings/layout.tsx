import { withPageMetadata } from "@/lib/seo";

export const metadata = withPageMetadata("/account/settings", {
  title: "Account Settings",
  description: "Manage your CORE profile, account security, connected services, and notification preferences.",
  robots: { index: false, follow: false },
});

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
