import { redirect } from "next/navigation";

type Params = { params: Promise<{ slug: string }> };

/**
 * Keep legacy Watch-network links working while routing them to the single
 * creator channel home. This keeps the visual language and content model
 * consistent across every entry point.
 */
export default async function LegacyNetworkPage({ params }: Params) {
  const { slug } = await params;
  redirect(`/channels/${encodeURIComponent(slug)}`);
}
