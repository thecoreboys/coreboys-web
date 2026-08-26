import type { Route } from "next";
import { permanentRedirect } from "next/navigation";
import { legacyMemberRedirectTarget, type RouteSearchParams } from "@/lib/member-profile-routes";

type Params = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RouteSearchParams>;
};

export default async function LegacyMemberNumbersPage({ params, searchParams }: Params) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  permanentRedirect(legacyMemberRedirectTarget(slug, "numbers", query) as Route);
}
