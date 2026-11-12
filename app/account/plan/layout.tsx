import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = withPageMetadata("/account/plan", {
  title: "Membership & Billing",
  description: "Manage your CORE website membership and billing.",
  robots: { index: false, follow: false },
});

export default function AccountPlanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
