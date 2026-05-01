"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Eyebrow } from "@/components/typography";
import { SectionNumber } from "@/components/editorial/SectionNumber";

const PILLARS = [
  { letter: "C", word: "REATE", line: "We make the things we want to watch." },
  { letter: "O", word: "WN", line: "Our IP. Our channels. Our terms." },
  { letter: "R", word: "UN", line: "No middlemen. No clauses. No exits." },
  { letter: "E", word: "VERYTHING", line: "From the kitchen to the keynote." },
] as const;

export function Manifesto() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const items = gsap.utils.toArray<HTMLElement>(".manifesto-item");
      gsap.set(items, { opacity: 0.15 });
      items.forEach((item, i) => {
        const word = item.querySelector<HTMLElement>(".m-word");
        const line = item.querySelector<HTMLElement>(".m-line");
        if (!word || !line) return;
        gsap.set(word, { width: 0 });
        gsap.set(line, { opacity: 0, y: 12 });

        ScrollTrigger.create({
          trigger: item,
          start: "top center+=80",
          end: "bottom center",
          onEnter: () => {
            gsap.to(item, { opacity: 1, duration: 0.4, ease: "power2.out" });
            gsap.to(word, { width: "auto", duration: 0.9, ease: "expo.out", delay: 0.05 });
            gsap.to(line, { opacity: 1, y: 0, duration: 0.6, ease: "expo.out", delay: 0.25 });
          },
          onLeaveBack: () => {
            gsap.to(item, { opacity: 0.15, duration: 0.3 });
            gsap.to(word, { width: 0, duration: 0.5, ease: "expo.in" });
            gsap.to(line, { opacity: 0, y: 12, duration: 0.3 });
          },
        });
        if (i === 0) {
          // Manual fire if first item is already in view at mount
          ScrollTrigger.refresh();
        }
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="manifesto"
      ref={root}
      className="relative w-full bg-[color:var(--bg)] py-32 md:py-48"
    >
      <SectionNumber index={1} label="Manifesto" />
      <div className="mx-auto max-w-[1440px] px-6 md:px-16">
        <Eyebrow className="mb-16">The acronym</Eyebrow>
        <ul className="flex flex-col gap-20 md:gap-28">
          {PILLARS.map(({ letter, word, line }) => (
            <li key={letter} className="manifesto-item">
              <div className="flex flex-col">
                <div className="flex items-baseline whitespace-nowrap font-display font-black tracking-tight">
                  <span className="text-[18vw] md:text-[10rem] leading-[0.85] text-[color:var(--ink)]">
                    {letter}
                  </span>
                  <span
                    className="m-word inline-block overflow-hidden text-[10vw] md:text-[6rem] leading-[0.85] text-[color:var(--core)]"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {word}
                  </span>
                </div>
                <p className="m-line mt-4 max-w-xl text-lg md:text-xl text-[color:var(--ink-dim)]">
                  {line}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
