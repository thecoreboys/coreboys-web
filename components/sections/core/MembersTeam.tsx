import Link from "next/link";

import { MEMBERS } from "@/lib/members";
import { fetchUsersByLogin } from "@/lib/twitch";

/**
 * "The members" — adapted from the vendored Untitled UI team section
 * (components/marketing/team-sections/team-section-image-card-01.tsx).
 *
 * Clean UUI image-card grid (responsive 2/3 columns): each card is a member
 * portrait (falling back to the live Twitch avatar), the stage name, and a
 * short tagline. The whole card links to /about/{slug}. Per-member SOCIAL LINKS
 * intentionally live ONLY on the individual /about/{slug} pages, not here.
 *
 * Server component — fetches Twitch profile images in parallel and degrades
 * gracefully (no avatar) if Twitch is unreachable.
 */

/** First clause of the bio, trimmed, as a short even role line. */
function tagline(bio: string): string {
  const first = bio.split(/[.—\n]/)[0]?.trim() ?? "";
  if (first.length <= 64) return first;
  return first.slice(0, 61).replace(/\s+\S*$/, "") + "…";
}

export async function MembersTeam() {
  let avatars: Record<string, string> = {};
  try {
    const users = await fetchUsersByLogin(MEMBERS.map((m) => m.twitchLogin));
    for (const [login, u] of Object.entries(users)) {
      if (u.profile_image_url) avatars[login] = u.profile_image_url;
    }
  } catch {
    avatars = {};
  }

  const cards = MEMBERS.map((m) => ({
    slug: m.slug,
    stageName: m.stageName,
    role: tagline(m.bio),
    imageUrl: m.portrait ?? avatars[m.twitchLogin.toLowerCase()] ?? null,
  }));

  return (
    <section id="members" className="bg-primary py-16 md:py-24">
      <div className="mx-auto max-w-container px-6 md:px-8">
        <div className="flex w-full max-w-3xl flex-col">
          <span className="text-sm font-semibold text-brand-secondary">The members</span>
          <h2 className="mt-3 text-display-sm font-semibold text-primary md:text-display-md">
            Meet the <span className="gradient-text">six</span>.
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-tertiary md:mt-5 md:text-xl">
            Six creators, one house. Everyone here built their own channels and their own crowd,
            and together it just hits different.
          </p>
        </div>

        <div className="mt-12 md:mt-16">
          <ul className="grid w-full grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 md:gap-y-12 lg:grid-cols-3">
            {cards.map((m) => (
              <li key={m.slug}>
                <Link
                  href={`/channels/${m.slug}` as never}
                  className="group flex flex-col gap-4 rounded-2xl outline-focus-ring transition focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-secondary ring-1 ring-inset ring-secondary">
                    {m.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={m.stageName}
                        src={m.imageUrl}
                        className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-display-sm font-semibold text-quaternary">
                        {m.stageName.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-primary">{m.stageName}</h3>
                    <p className="text-md text-brand-secondary">{m.role}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
