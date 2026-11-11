import type { Metadata } from "next";
import { MultiviewRemote } from "@/components/watch/MultiviewRemote";

export const metadata: Metadata = {
  title: "Multiview Remote",
  description: "Control your CORE Multiview from your phone.",
  robots: { index: false },
};

export default function MultiviewRemotePage() {
  return <MultiviewRemote />;
}
