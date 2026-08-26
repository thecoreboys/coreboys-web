import type { Metadata } from "next";
import { PricingExperience } from "@/components/marketing/PricingExperience";

export const metadata: Metadata = {
  title: "Support the Site",
  description:
    "CORE membership starts at $3 per month and helps pay for the independent site. Public content remains free.",
  robots: { index: false, follow: false },
};

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedFeature = Array.isArray(params.feature) ? params.feature[0] : params.feature;
  return <PricingExperience focusFeature={requestedFeature} />;
}
