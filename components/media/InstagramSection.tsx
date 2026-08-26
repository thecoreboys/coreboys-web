import { cookies } from "next/headers";
import { Camera01, ArrowUpRight } from "@untitledui/icons";
import Instagram from "@/components/foundations/social-icons/instagram";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { Badge } from "@/components/base/badges/badges";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import {
  getEnabledInstagramSources,
  fetchInstagramMedia,
  type InstagramPost,
  type InstagramSource,
} from "@/lib/instagram";

/** Best-effort admin check — never throws; returns false on any error. */
async function viewerIsAdmin(): Promise<boolean> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return false;
    return (await verifySessionToken(token)) !== null;
  } catch {
    return false;
  }
}

/**
 * "From our Instagram" — server component. For each ENABLED source it
 * pulls recent media via the Instagram Graph API (key-gated on
 * INSTAGRAM_TOKEN). When there are no posts (no token / no connection) it
 * shows a graceful empty state: a connect prompt for admins, hidden for
 * visitors. Never throws.
 *
 * `isAdmin` controls whether the empty state is shown to the viewer.
 */
export async function InstagramSection() {
  const isAdmin = await viewerIsAdmin();
  let sources: InstagramSource[] = [];
  try {
    sources = await getEnabledInstagramSources();
  } catch {
    sources = [];
  }

  // Pull media for each enabled source (deduped by post id across sources,
  // since the Graph API token is account-scoped).
  const seen = new Set<string>();
  const posts: Array<InstagramPost & { ownerLabel: string; handle: string }> = [];
  for (const src of sources) {
    let media: InstagramPost[] = [];
    try {
      media = await fetchInstagramMedia(src.handle, 8);
    } catch {
      media = [];
    }
    for (const p of media) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      posts.push({ ...p, ownerLabel: src.ownerLabel, handle: src.handle });
    }
  }

  posts.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
  const visible = posts.slice(0, 12);

  const hasPosts = visible.length > 0;
  const tokenSet = Boolean(process.env.INSTAGRAM_TOKEN);

  // Visitors with nothing to show see nothing — no broken section.
  if (!hasPosts && !isAdmin) return null;

  return (
    <section
      id="instagram"
      className="border-t border-secondary scroll-mt-24"
      aria-labelledby="instagram-heading"
    >
      <div className="mx-auto max-w-container px-6 py-10 md:px-8 md:py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-brand-secondary">Live · Social</p>
            <h2
              id="instagram-heading"
              className="mt-2 text-display-sm font-semibold tracking-tight text-primary md:text-display-md"
            >
              From our <span className="gradient-text">Instagram.</span>
            </h2>
            <p className="mt-2 max-w-[60ch] text-lg text-tertiary">
              The latest from the house, straight off the grid.
            </p>
          </div>
          {sources.length > 0 ? (
            <a
              href={`https://instagram.com/${sources[0]!.handle}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-secondary bg-primary px-3.5 py-2.5 text-sm font-semibold text-secondary shadow-xs-skeuomorphic transition-all hover:-translate-y-px hover:text-primary"
            >
              Follow on Instagram
              <ArrowUpRight className="size-5 text-fg-quaternary" />
            </a>
          ) : null}
        </div>

        {hasPosts ? (
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
            {visible.map((p) => (
              <li key={p.id}>
                <a
                  href={p.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative block aspect-square overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ring-secondary transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  {/* IG CDN host isn't in next.config remotePatterns; use a
                      plain img so the browser fetches it directly. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.mediaUrl}
                    alt={p.caption?.slice(0, 120) ?? `Instagram post by @${p.handle}`}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <Instagram size={16} className="size-4 text-white" />
                    <span className="truncate text-xs font-semibold text-white">
                      @{p.handle}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          // Admin-only empty state.
          <div className="mt-8 flex min-h-[220px] flex-col items-center justify-center rounded-2xl bg-secondary p-10 text-center shadow-xs-skeuomorphic ring-1 ring-inset ring-secondary">
            <FeaturedIcon icon={Camera01} size="xl" color="brand" theme="modern" />
            <p className="mt-4 text-md font-semibold text-primary">
              Connect Instagram to show photos
            </p>
            <p className="mt-1 max-w-[48ch] text-sm text-tertiary">
              {tokenSet
                ? "A token is set, but no media came back for the enabled sources yet. Confirm the connected account and enabled handles in admin."
                : "Set the server INSTAGRAM_TOKEN (and INSTAGRAM_USER_ID) to pull live media. Choose which handles appear in admin."}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Badge type="pill-color" color={tokenSet ? "success" : "warning"} size="sm">
                {tokenSet ? "Token set" : "Token missing"}
              </Badge>
              <Badge type="pill-color" color="gray" size="sm">
                {sources.length} enabled source{sources.length === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
