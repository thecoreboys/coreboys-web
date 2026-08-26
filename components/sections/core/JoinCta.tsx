import { Button } from "@/components/base/buttons/button";
import { getGroupPhotos } from "@/lib/asset-index";
import { CtaSurface } from "@/components/marketing/CtaSurface";

/**
 * JoinCta — closing call to action for the home page.
 *
 * Adapted from the vendored UUI `CTAAbstractImagesBrand` section
 * (components/marketing/cta/cta-abstract-images-brand.tsx): we keep its
 * brand section background, two-column layout, display-scale heading and
 * the abstract image mosaic on the right. The mosaic is wired to CORE's
 * real group photos (getGroupPhotos), falling back to UUI's abstract
 * imagery when no local photos are present, so the layout never breaks.
 *
 * Server component — getGroupPhotos reads from disk/manifest.
 */

// Five mosaic tiles using the UUI grid placement from the vendored base.
const TILES: { area: string }[] = [
  { area: "3 / 3 / 7 / 7" },
  { area: "1 / 7 / 7 / 11" },
  { area: "7 / 5 / 13 / 9" },
  { area: "7 / 9 / 10 / 13" },
  { area: "7 / 1 / 10 / 5" },
];

// UUI abstract imagery — used as a graceful fallback per-tile.
const FALLBACK = [
  "https://www.untitledui.com/marketing/smiling-girl-5.webp",
  "https://www.untitledui.com/marketing/abstract-image-02.webp",
  "https://www.untitledui.com/marketing/abstract-image-03.webp",
  "https://www.untitledui.com/marketing/smiling-girl-6.webp",
  "https://www.untitledui.com/marketing/smiling-girl-2.webp",
];

export function JoinCta() {
  let photos: string[] = [];
  try {
    photos = getGroupPhotos();
  } catch {
    photos = [];
  }

  const sources = TILES.map((_, i) => photos[i % (photos.length || 1)] ?? FALLBACK[i]);

  return (
    <section
      className="relative isolate overflow-hidden py-16 lg:py-24"
      style={{ background: "var(--ironbow-band)" }}
    >
      {/* Ambient blooms behind the CTA */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute -left-32 top-0 size-[520px] rounded-full opacity-30 blur-[120px]"
          style={{ background: "radial-gradient(circle, #db0368, transparent 70%)" }}
        />
        <div
          className="absolute -right-24 bottom-0 size-[520px] rounded-full opacity-25 blur-[120px]"
          style={{ background: "radial-gradient(circle, #e63d92, transparent 70%)" }}
        />
      </div>
      <CtaSurface variant="drop-event" density="hero" marquee="ONE HOUSE · SIX CREATORS · MAKE IT YOURS" serial="CORE / JOIN 01" className="relative mx-auto grid max-w-container grid-cols-1 gap-16 px-6 py-10 md:px-8 md:py-12 lg:grid-cols-2 lg:items-center" aria-label="Create your CORE account">
        <div className="flex max-w-3xl flex-col items-start">
          <p className="text-sm font-semibold text-tertiary_on-brand">One house. Six creators.</p>
          <h2 className="mt-3 text-display-sm font-semibold text-primary_on-brand md:text-display-md lg:text-display-lg">
            Get in early.
          </h2>
          <p className="mt-4 text-lg text-tertiary_on-brand md:mt-6 md:text-xl">
            Make a free account and you&apos;re in from day one. Clips, streams, drops, all of it —
            and the good stuff hits members first.
          </p>

          <div className="mt-8 flex w-full flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-start md:mt-12">
            <Button color="secondary" size="xl" href="/clips" className="shadow-xs! ring-0">
              Browse the clips
            </Button>
            <Button size="xl" href="/signup">
              Create your account
            </Button>
          </div>
        </div>

        <div className="grid h-122 w-[150%] grid-cols-[repeat(12,1fr)] grid-rows-[repeat(12,1fr)] gap-2 justify-self-center sm:h-124 sm:w-[120%] md:w-auto md:gap-4">
          {TILES.map((tile, i) => (
            <img
              key={tile.area}
              src={sources[i]}
              className="size-full rounded-lg object-cover transition-transform duration-500 ease-out hover:scale-[1.04]"
              alt="CORE"
              style={{ gridArea: tile.area }}
            />
          ))}
        </div>
      </CtaSurface>
    </section>
  );
}
