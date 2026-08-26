import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Calendar } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badges";
import { ScrollItem, ScrollReveal } from "@/components/ui/ScrollReveal";

type Announcement = {
  id: string;
  date: string;
  category: string;
  title: string;
  href: string;
  image?: string;
};

/**
 * Featured announcements rail — three editorial cards across at lg+,
 * stacks at md-. Data is intentionally hard-coded for now; the schema
 * matches `Post` in coreboys-db so these can be swapped to a CMS fetch
 * in Phase 3 with no shape change.
 */
export function AnnouncementsRail() {
  // Empty until articles ship from the DB. The whole rail hides when
  // there's nothing rather than rendering a "Latest from the org"
  // header followed by a placeholder card.
  const items: Announcement[] = [];
  if (items.length === 0) return null;

  return (
    <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
      <div className="mx-auto max-w-container px-6 py-16 md:px-8 md:py-24">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Announcements</p>
            <h2 className="mt-2 text-display-sm font-semibold tracking-tight text-[color:var(--ink)] md:text-display-md">
              Latest from <span className="gradient-text">the org.</span>
            </h2>
          </div>
          <Button href="/news" color="link-color" size="md" iconTrailing={<ArrowUpRight data-icon="trailing" className="size-5 pointer-events-none" />}>
            All posts
          </Button>
        </header>

        <ScrollReveal as="ul" className="grid grid-cols-1 gap-4 md:grid-cols-2" stagger={0.1}>
          {items.map((a, i) => (
            <ScrollItem key={a.id} as="li">
              <Link
                href={a.href as never}
                className="group flex h-full flex-col overflow-hidden rounded-xl bg-[color:var(--bg-elev)] ring-1 ring-inset ring-[color:var(--rule)] shadow-xs-skeuomorphic transition-colors hover:ring-[color:var(--rule-strong)] hover:bg-[color:var(--surface)]"
              >
                {a.image ? (
                  <span className="relative block aspect-[16/10] w-full overflow-hidden bg-black media-tone">
                    <Image
                      src={a.image}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover grayscale-[0.35] transition duration-500 group-hover:grayscale-0 group-hover:scale-[1.03]"
                      priority={i === 0}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, transparent 60%, rgba(8,8,10,0.85) 100%)",
                      }}
                    />
                    <span className="absolute left-3 top-3">
                      <Badge type="modern" color="gray" size="sm">
                        {a.category}
                      </Badge>
                    </span>
                  </span>
                ) : null}

                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-center gap-2 text-[color:var(--ink-faint)]">
                    <Calendar className="size-3" data-icon />
                    <time
                      dateTime={a.date}
                      className="font-mono text-xs uppercase tracking-[0.18em]"
                    >
                      {formatDate(a.date)}
                    </time>
                  </div>
                  <h3 className="text-balance text-lg font-semibold leading-snug tracking-tight text-[color:var(--ink)]">
                    {a.title}
                  </h3>
                  <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-[color:var(--ink-dim)] group-hover:text-[color:var(--core)]">
                    Read more <ArrowUpRight className="size-3" data-icon />
                  </span>
                </div>
              </Link>
            </ScrollItem>
          ))}
        </ScrollReveal>
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
