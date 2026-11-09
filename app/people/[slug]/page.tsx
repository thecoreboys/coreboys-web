import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicFaceGuestProfile } from "@/lib/face-recognition-store";
import { FacePersonSlugSchema } from "@/lib/face-people";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guest creator · CORE", robots: { index: false, follow: false } };

export default async function GuestCreatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const parsed = FacePersonSlugSchema.safeParse((await params).slug);
  if (!parsed.success) notFound();
  const person = await getPublicFaceGuestProfile(parsed.data);
  if (!person) notFound();
  return (
    <main className="min-h-screen bg-primary px-6 pb-20 pt-32 text-primary">
      <div className="mx-auto max-w-2xl rounded-2xl border border-secondary p-8 sm:p-12">
        <p className="text-sm font-semibold text-brand-secondary">Friends of CORE</p>
        <h1 className="mt-3 text-4xl font-semibold">{person.displayName}</h1>
        <p className="mt-4 text-tertiary">Find this guest creator on their channels.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          {person.socials.map((social) => (
            <a key={`${social.platform}:${social.url}`} href={social.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-secondary px-5 py-3 font-semibold capitalize hover:bg-secondary">
              {social.platform}{social.handle ? ` · @${social.handle}` : ""}
            </a>
          ))}
        </div>
        <Link href="/watch" className="mt-10 inline-block text-sm font-semibold text-brand-secondary">Back to Watch</Link>
      </div>
    </main>
  );
}
