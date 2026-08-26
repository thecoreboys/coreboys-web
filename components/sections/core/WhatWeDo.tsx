import type { Route } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart04, Heart, PlayCircle, Scissors02, Users01, Zap } from "@untitledui/icons";
import { getGroupPhotos } from "@/lib/asset-index";

/**
 * "Everything happening at CORE" — intriguing, image-led call-to-action
 * cards (one per surface of the site). Each card is a real photo with a
 * dark gradient scrim, an icon chip, and a title/teaser that slides an
 * arrow on hover. Sits on an elevated neutral surface so it reads as its
 * own section in dark mode (UUI brand-section tokens collapse to neutral
 * in dark, so we don't rely on them here).
 */
type Item = { title: string; subtitle: string; href: Route; icon: typeof Zap };

const ITEMS: Item[] = [
  { title: "Live streams", subtitle: "See who's on air right now and jump straight into the broadcast.", href: "/metrics" as Route, icon: Zap },
  { title: "Clips", subtitle: "The best moments, cut and ready to share — updated as we play.", href: "/clips" as Route, icon: Scissors02 },
  { title: "Videos", subtitle: "Full uploads from across the house, all in one place.", href: "/videos" as Route, icon: PlayCircle },
  { title: "Fan zone", subtitle: "Mail, shout-outs, and the stuff you send us. We read all of it.", href: "/fanzone" as Route, icon: Heart },
  { title: "Community polls", subtitle: "Vote on what we make next. Your call shapes the schedule.", href: "/fanzone#polls" as Route, icon: BarChart04 },
  { title: "The members", subtitle: "Six creators, one house. Meet everyone who runs it.", href: "#members" as Route, icon: Users01 },
];

const BRAND_BG = "var(--ironbow-band)";

export function WhatWeDo() {
  const photos = getGroupPhotos();

  return (
    <section className="bg-secondary py-16 md:py-24">
      <div className="mx-auto max-w-container px-6 md:px-8">
        <div className="mb-10 flex max-w-2xl flex-col gap-3 md:mb-14">
          <p className="text-sm font-semibold text-brand-secondary">What goes on here</p>
          <h2 className="text-display-sm font-semibold tracking-tight text-primary md:text-display-md">
            Everything happening at <span className="gradient-text">CORE.</span>
          </h2>
          <p className="text-lg text-tertiary">
            Streams, clips, fresh uploads, and a fan zone we actually read. Jump into whatever
            you&apos;re here for.
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item, i) => {
            const Icon = item.icon;
            const img = photos.length ? photos[i % photos.length] : undefined;
            return (
              <li key={item.title}>
                <Link
                  href={item.href}
                  className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl ring-1 ring-inset ring-secondary transition-all hover:-translate-y-0.5 hover:shadow-xl hover:ring-brand-solid/50"
                >
                  {img ? (
                    <Image
                      src={img}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div aria-hidden className="absolute inset-0" style={{ background: BRAND_BG }} />
                  )}
                  {/* scrim */}
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10"
                  />

                  {/* icon chip */}
                  <span className="absolute left-4 top-4 grid size-10 place-items-center rounded-xl bg-white/15 text-white ring-1 ring-inset ring-white/20 backdrop-blur-sm">
                    <Icon className="size-5" />
                  </span>

                  {/* content */}
                  <div className="relative p-5">
                    <h3 className="flex items-center gap-1.5 text-lg font-semibold text-white">
                      {item.title}
                      <ArrowRight
                        aria-hidden
                        className="size-4 -translate-x-1 opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                      />
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm text-white/80">{item.subtitle}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
