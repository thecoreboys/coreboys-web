"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { LiveDot } from "./LiveDot";
import { useLoginIsLive } from "@/hooks/useLiveStatus";
import type { Member } from "@/lib/members";

export function MemberHex({
  member,
  onSelect,
  index,
}: {
  member: Member;
  onSelect: (slug: string) => void;
  index: number;
}) {
  const live = useLoginIsLive(member.twitchLogin);
  const ref = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  function onMouseMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: px * 8, y: py * -8 });
  }

  function onLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <motion.button
      ref={ref}
      onClick={() => onSelect(member.slug)}
      onMouseMove={onMouseMove}
      onMouseLeave={onLeave}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 0.6, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
      className="group relative aspect-[1/1.1547] w-full focus-visible:outline-none"
      aria-label={`Open ${member.stageName} details`}
    >
      <span
        className="hex-clip absolute inset-0 transition-[transform,filter] duration-500 [transition-timing-function:var(--ease-expo-out)] group-hover:scale-[1.02]"
        style={{
          background: `linear-gradient(180deg, ${member.accent}30 0%, transparent 60%), var(--bg-elev)`,
          transform: `perspective(800px) rotateY(${tilt.x}deg) rotateX(${tilt.y}deg)`,
        }}
      >
        <span
          className="absolute inset-[2px] hex-clip overflow-hidden"
          style={{ background: "var(--bg)" }}
        >
          <Image
            src={member.portrait}
            alt={member.stageName}
            fill
            sizes="(min-width: 1024px) 28vw, 92vw"
            className="object-cover transition-transform duration-700 [transition-timing-function:var(--ease-expo-out)] group-hover:scale-105"
            priority={index < 3}
          />
          <span
            className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-hover:opacity-0"
            style={{
              background:
                "linear-gradient(180deg, transparent 30%, rgba(6,7,10,0.85) 100%)",
            }}
          />
          <span
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 mix-blend-screen"
            style={{
              background: `radial-gradient(60% 60% at 50% 60%, ${member.accent}55 0%, transparent 70%)`,
            }}
          />
        </span>
      </span>

      <span className="absolute right-3 top-3 z-10">
        <LiveDot live={live} />
      </span>

      <span className="absolute inset-x-0 bottom-4 z-10 flex flex-col items-center text-center">
        <span className="text-base md:text-lg font-semibold tracking-tight">{member.stageName}</span>
        <span className="kicker mt-1 text-xs">{member.realName}</span>
      </span>
    </motion.button>
  );
}
