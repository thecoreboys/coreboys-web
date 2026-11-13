import { withPageMetadata } from "@/lib/seo";

export const metadata = withPageMetadata("/account/catch-up", {
  title: "Catch Up",
  description: "New videos, clips, shorts and broadcasts from your CORE creators since you last caught up.",
  robots: { index: false, follow: false },
});

export default function CatchUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
