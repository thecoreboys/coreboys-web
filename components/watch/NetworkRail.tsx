"use client";

import Link from "next/link";
import { MEMBERS } from "@/lib/members";
import { MemberPulse } from "./MemberPulse";
import { DragScrollRail } from "./DragScrollRail";

export function NetworkRail({
  personalized = false,
  preferredMemberSlugs = [],
}: {
  personalized?: boolean;
  preferredMemberSlugs?: readonly string[];
}) {
  const order = new Map(preferredMemberSlugs.map((slug, index) => [slug, index]));
  const members = [...MEMBERS].sort((left, right) => {
    const leftRank = order.get(left.slug) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = order.get(right.slug) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
  return (
    <section className="px-5 md:px-10">
      <p className="watch-kicker mb-3">{personalized ? "Your networks" : "Networks"}</p>
      <DragScrollRail className="watch-shelf" tabIndex={0} aria-label={personalized ? "Your CORE networks" : "CORE networks"}>
        {members.map((m) => (
          <div key={m.slug} className="relative w-40 shrink-0 snap-start sm:w-48">
            <Link
              href={`/watch/network/${m.slug}` as never}
              aria-label={`Browse ${m.stageName} network`}
              data-cursor-hint={`Browse ${m.stageName}`}
              className="group relative block aspect-[4/5] overflow-hidden rounded-xl ring-1 ring-white/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.portrait}
                alt=""
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-3">
                <span className="block text-xl font-bold tracking-tight">{m.stageName}</span>
                <span className="mt-0.5 block text-[10px] uppercase tracking-[0.18em] text-[color:var(--core)]">
                  {m.comm.name}
                </span>
              </span>
            </Link>
            <MemberPulse slug={m.slug} login={m.twitchLogin} className="mt-1.5" href={`/watch/network/${m.slug}`} />
          </div>
        ))}
      </DragScrollRail>
    </section>
  );
}
