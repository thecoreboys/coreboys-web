import { withPageMetadata } from "@/lib/seo";

export const metadata = withPageMetadata("/account", {
  title: "Your CORE Account",
  description: "Manage your private CORE account, profile, connected services, and preferences.",
  robots: { index: false, follow: false },
});

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
