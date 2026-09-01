"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Display, Eyebrow } from "@/components/typography";
import { SectionNumber } from "@/components/editorial/SectionNumber";
import { LiveDot } from "@/components/ui/LiveDot";
import { MEMBERS } from "@/lib/members";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { cascade, durations, ease } from "@/lib/motion";

export function TheSix() {
  const reduceMotion = useReducedMotion();
  const { data } = useLiveStatus();

  const liveLogins = useMemo(() => {
    return new Set(
      (data?.live ?? [])
        .filter((e) => e.isLive)
        .map((e) => e.login.toLowerCase()),
    );
  }, [data]);

  return (
    <section id="members" className="relative w-full bg-[color:var(--bg)] py-28 md:py-40 rule">
      <SectionNumber index={1} label="The six" />
      <div className="mx-auto max-w-container px-6 md:px-16">
        <Eyebrow className="mb-3">The six</Eyebrow>
        <Display as="h2" size={72} className="max-w-4xl md:text-[120px]">
          The names on the wall.
        </Display>

        <ul className="mt-16 grid grid-cols-2 gap-x-5 gap-y-12 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-6">
          {MEMBERS.map((m, i) => {
            const live = liveLogins.has(m.twitchLogin.toLowerCase());
            return (
              <li key={m.slug}>
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-12% 0px" }}
                  transition={{
                    duration: reduceMotion ? 0 : durations.slow / 1000,
                    delay: reduceMotion ? 0 : cascade(i),
                    ease: ease.out,
                  }}
                >
                  <Link
                    href={`/channels/${m.slug}` as never}
                    className="group block rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--core)]"
                    data-cursor="hover"
                  >
                    <div className="relative aspect-[3/4] overflow-hidden bg-[color:var(--bg-elev)]">
                      <Image
                        src={m.portrait}
                        alt={m.stageName}
                        fill
                        sizes="(min-width: 1024px) 16vw, 45vw"
                        className="object-cover"
                        priority={i < 2}
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                        style={{ boxShadow: `inset 0 0 0 1px ${m.accent}` }}
                      />
                      {live ? (
                        <span className="absolute right-3 top-3">
                          <LiveDot live />
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4">
                      <h3 className="font-display text-xl font-semibold tracking-tight text-[color:var(--ink)] md:text-2xl">
                        {m.stageName}
                      </h3>
                      <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
                        {m.realName}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
