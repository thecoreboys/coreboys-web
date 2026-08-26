import type { Route } from "next";
import { permanentRedirect } from "next/navigation";

type Params = { params: Promise<{ slug: string }> };

export default async function LegacyMemberOpenGraphImage({ params }: Params) {
  const { slug } = await params;
  permanentRedirect(`/about/${encodeURIComponent(slug)}/opengraph-image` as Route);
}
