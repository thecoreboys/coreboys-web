import { withPageMetadata } from "@/lib/seo";

export const metadata = withPageMetadata("/studio", {
  title: "CORE Studio",
  description: "Private CORE creator and staff tools. Staff sign-in is required.",
  robots: { index: false, follow: false },
});

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
