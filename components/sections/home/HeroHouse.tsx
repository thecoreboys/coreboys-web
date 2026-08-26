"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown } from "@untitledui/icons";
import { durations, ease } from "@/lib/motion";
import { Eyebrow } from "@/components/typography";
import { LiveDot } from "@/components/ui/LiveDot";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { MEMBERS_BY_LOGIN } from "@/lib/members-helpers";

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function HeroHouse({ still }: { still: string }) {
  const reduceMotion = useReducedMotion();
  const { data } = useLiveStatus();

  const live = useMemo(() => {
    return (data?.live ?? []).filter((e) => e.isLive);
  }, [data]);

  const onAir = live.length > 0;

  const fade = reduceMotion
    ? { duration: 0 }
    : { duration: durations.slow / 1000, ease: ease.out };

  return (
    <section
      id="hero"
      className="relative isolate h-[100svh] min-h-[640px] w-full -mt-14 overflow-hidden md:-mt-16"
    >
      <Image
        src={still}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 50% 42%, rgba(8,8,10,0.12) 0%, rgba(8,8,10,0.52) 58%, rgba(8,8,10,0.94) 100%)",
        }}
      />

      <h1 className="sr-only">CORE. Six creators. One house. We own the work.</h1>

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, letterSpacing: "0.35em" }}
          animate={{ opacity: 1, letterSpacing: "0.02em" }}
          transition={{ ...fade, delay: reduceMotion ? 0 : 0.15 }}
          className="font-logo wordmark-fill text-[22vw] leading-[0.8] md:text-[200px]"
        >
          CORE
        </motion.p>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...fade, delay: reduceMotion ? 0 : 0.45 }}
          className="mt-6 font-mono text-xs uppercase tracking-[0.18em] text-white"
        >
          Create. Own. Run. Everything.
        </motion.p>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...fade, delay: reduceMotion ? 0 : 0.65 }}
          className="mt-5 max-w-md text-base text-white/80 md:text-lg"
        >
          Six creators. One house. We own the work.
        </motion.p>
        {onAir ? (
          <ul className="mt-10 grid w-full max-w-4xl grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {live.map((e) => {
              const member = MEMBERS_BY_LOGIN.get(e.login.toLowerCase());
              return (
                <li key={e.login}>
                  <Link
                    href={`/watch/live/${e.login}` as never}
                    className="flex flex-col items-center gap-2 rounded-xl bg-black/35 px-2 py-3 ring-1 ring-white/15 backdrop-blur-sm transition hover:bg-black/50"
                  >
                    <LiveDot live />
                    <span className="text-sm font-semibold text-white">
                      {member?.stageName ?? e.login}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-6 z-10 flex items-end justify-between px-6 md:px-16">
        <Eyebrow className="text-white/55">House · undisclosed</Eyebrow>
        {onAir ? (
          <Link
            href="/watch"
            className="group inline-flex min-h-11 items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-white transition-colors hover:text-white"
          >
            <span className="block h-px w-12 bg-current transition-[width] duration-300 [transition-timing-function:var(--ease-out)] group-hover:w-20" />
            Watch
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => scrollToId("members")}
            className="group inline-flex min-h-11 items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-white transition-colors"
            data-cursor="hover"
          >
            <span className="block h-px w-12 bg-current transition-[width] duration-300 [transition-timing-function:var(--ease-out)] group-hover:w-20" />
            Enter the house
            <ArrowDown className="size-3" />
          </button>
        )}
      </div>
    </section>
  );
}
