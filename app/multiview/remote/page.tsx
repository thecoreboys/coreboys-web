import { withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { MultiviewRemote } from "@/components/watch/MultiviewRemote";

export const metadata: Metadata = withPageMetadata("/multiview/remote", {
  title: "Multiview Remote",
  description: "Control your desktop CORE Multiview from your phone. Switch the main stream and follow its live chat using the same CORE account.",
  robots: { index: false },
});

export default function MultiviewRemotePage() {
  return <MultiviewRemote />;
}
