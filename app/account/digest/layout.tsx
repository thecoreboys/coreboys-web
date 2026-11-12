import { withPageMetadata } from "@/lib/seo";

export const metadata = withPageMetadata("/account/digest", {
  title: "Your CORE Digest",
  description: "Your private CORE account digest and creator updates.",
  robots: { index: false, follow: false },
});

export default function DigestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
