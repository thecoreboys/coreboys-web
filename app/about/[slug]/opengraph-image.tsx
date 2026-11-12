import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";

export const runtime = "nodejs";
export const revalidate = 86400;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "The Core Boys — creator profile";

type Props = { params: { slug: string } };

export async function generateImageMetadata({ params }: Props) {
  const { slug } = await params;
  const member = MEMBERS_BY_SLUG[slug];
  return member ? [{ id: member.slug, alt: member.stageName + " — The Core Boys", contentType, size }] : [];
}

export async function generateStaticParams() {
  return MEMBERS.map(member => ({ slug: member.slug }));
}

export default async function MemberOG({ params }: Props) {
  const { slug } = await params;
  const member = MEMBERS_BY_SLUG[slug];
  if (!member) return new Response("Not found", { status: 404 });
  const image = await readFile(join(process.cwd(), "public", "social", member.slug + "-share-2026.png"));
  return new Response(new Uint8Array(image), { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" } });
}
