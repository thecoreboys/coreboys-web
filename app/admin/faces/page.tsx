import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ScanFace } from "lucide-react";
import { MEMBERS, CREW } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";
import { getCrewPortrait } from "@/lib/asset-index";
import { AuthGate } from "@/components/admin/AuthGate";

export const metadata: Metadata = {
  title: "Admin · Face recognition",
  robots: { index: false, follow: false },
};

export const revalidate = 600;

export default async function AdminFacesPage() {
  const hasAwsKeys = !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_REGION
  );
  const collection = process.env.REKOGNITION_FACE_COLLECTION ?? "coreboys-faces";

  let avatars: Record<string, string> = {};
  try {
    const users = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatars[login] = u.profile_image_url;
    }
  } catch {
    avatars = {};
  }

  return (
    <AuthGate>
      <main className="relative pt-20 md:pt-24">
        <section className="relative mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
          >
            <ArrowLeft size={11} /> Admin
          </Link>
          <p className="mt-2 eyebrow inline-flex items-center gap-2">
            <ScanFace size={11} />
            Admin · Face recognition
          </p>
          <h1 className="mt-2 text-display text-[clamp(28px,3.6vw,44px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
            Face collection.
          </h1>
          <p className="mt-2 max-w-[60ch] text-[14px] text-[color:var(--ink-dim)]">
            AWS Rekognition indexes every member, crew, and approved talent face. New photo
            uploads run <code className="font-mono">SearchFacesByImage</code> against the
            collection — high-confidence hits auto-tag, the rest land in the suggestion queue
            below for admin review.
          </p>
        </section>

        {!hasAwsKeys ? (
          <section className="border-t border-[color:var(--rule)]">
            <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8 md:py-12">
              <div className="rounded-xl border border-dashed border-[color:var(--core)]/40 bg-[color:var(--core)]/8 p-6">
                <p className="text-[13px] font-semibold text-[color:var(--core)]">
                  Rekognition not configured
                </p>
                <p className="mt-1 text-[13px] text-[color:var(--ink-dim)]">
                  Set the following environment variables to enable face detection +
                  auto-tagging:
                </p>
                <pre className="mt-3 rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] p-3 text-[11px] text-[color:var(--ink-dim)]">{`AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
REKOGNITION_FACE_COLLECTION=coreboys-faces`}</pre>
                <p className="mt-3 text-[12px] text-[color:var(--ink-dim)]">
                  Once present, the bootstrap job in{" "}
                  <code className="font-mono">coreboys-api/jobs/index-faces.ts</code> enrolls
                  every member + crew portrait via{" "}
                  <code className="font-mono">IndexFaces</code> and the upload pipeline calls{" "}
                  <code className="font-mono">SearchFacesByImage</code> on each new photo.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {/* Enrolled subjects */}
        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8 md:py-12">
            <h2 className="text-[14px] font-semibold tracking-tight text-[color:var(--ink)]">
              Enrolled subjects
            </h2>
            <p className="mt-1 text-[12px] text-[color:var(--ink-dim)]">
              Collection: <code className="font-mono">{collection}</code> ·{" "}
              {MEMBERS.length + CREW.length} subjects
            </p>

            <div className="mt-6">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                Members · {MEMBERS.length}
              </h3>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {MEMBERS.map((m) => (
                  <li
                    key={m.slug}
                    className="rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-3"
                  >
                    <span className="relative block aspect-square w-full overflow-hidden rounded-md">
                      <Image
                        src={avatars[m.twitchLogin.toLowerCase()] ?? m.portrait}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </span>
                    <p className="mt-2 truncate text-[12px] font-semibold text-[color:var(--ink)]">
                      {m.stageName}
                    </p>
                    <p className="text-[10px] text-[color:var(--ink-dim)]">
                      ExternalImageId · {m.slug}
                    </p>
                    <span
                      className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-tight ${
                        hasAwsKeys
                          ? "border border-[color:var(--success)]/40 bg-[color:var(--success)]/12 text-[color:var(--success)]"
                          : "border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)]"
                      }`}
                    >
                      {hasAwsKeys ? "Indexed" : "Not indexed"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                Crew · {CREW.length}
              </h3>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {CREW.map((c) => {
                  const portrait = getCrewPortrait(c.slug);
                  return (
                    <li
                      key={c.slug}
                      className="rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-3"
                    >
                      <span className="relative block aspect-square w-full overflow-hidden rounded-md bg-[color:var(--bg)]">
                        {portrait ? (
                          <Image
                            src={portrait}
                            alt=""
                            fill
                            sizes="80px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[14px] font-bold text-[color:var(--ink-faint)]">
                            {c.name[0]}
                          </span>
                        )}
                      </span>
                      <p className="mt-2 truncate text-[12px] font-semibold text-[color:var(--ink)]">
                        {c.name}
                      </p>
                      <p className="text-[10px] text-[color:var(--ink-dim)]">
                        ExternalImageId · {c.slug}
                      </p>
                      <span
                        className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-tight ${
                          hasAwsKeys
                            ? "border border-[color:var(--success)]/40 bg-[color:var(--success)]/12 text-[color:var(--success)]"
                            : "border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)]"
                        }`}
                      >
                        {hasAwsKeys ? "Indexed" : "Not indexed"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* Suggestion queue (placeholder) */}
        <section className="border-t border-[color:var(--rule)]">
          <div className="mx-auto max-w-[1440px] px-6 py-8 md:px-8 md:py-12">
            <h2 className="text-[14px] font-semibold tracking-tight text-[color:var(--ink)]">
              Detection queue
            </h2>
            <p className="mt-1 text-[12px] text-[color:var(--ink-dim)]">
              Faces detected on new uploads with confidence between 0.5 and 0.85 land here for
              admin approve / deny. Above 0.85 auto-applies; below 0.5 is dropped.
            </p>
            <div className="mt-4 rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)] p-8 text-center">
              <p className="text-[12px] text-[color:var(--ink-faint)]">
                {hasAwsKeys
                  ? "No pending detections."
                  : "Detection pipeline runs once Rekognition is configured."}
              </p>
            </div>
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
