"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { PoBoxCardClient } from "@/components/fanzone/PoBoxCardClient";
import { CommunityStamp } from "@/components/fanzone/CommunityStamp";
import type { PoBox } from "@/lib/members";

export type FanMailMember = {
  slug: string;
  stageName: string;
  realName?: string;
  accent: string;
  avatarUrl: string;
  commLogo?: string;
  commName?: string;
  poBox?: PoBox;
};

export function FanMailDirectory({ members }: { members: FanMailMember[] }) {
  const { user, loading } = useAuth();
  const [favoriteSlug, setFavoriteSlug] = useState<string | null>(null);
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  useEffect(() => {
    if (loading || !user) {
      setFavoriteSlug(null);
      setFavoriteOnly(false);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/account/loyalty", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { favoriteMember?: string | null } | null) => setFavoriteSlug(data?.favoriteMember ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [loading, user]);

  const visible = useMemo(() => {
    const sorted = [...members].sort((a, b) => Number(b.slug === favoriteSlug) - Number(a.slug === favoriteSlug));
    return favoriteOnly && favoriteSlug ? sorted.filter((member) => member.slug === favoriteSlug) : sorted;
  }, [favoriteOnly, favoriteSlug, members]);

  return (
    <>
      {favoriteSlug ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-tertiary">
          <Heart size={14} fill="currentColor" className="text-brand-secondary" aria-hidden />
          <span>Your favorite is shown first.</span>
          <button
            type="button"
            aria-pressed={favoriteOnly}
            onClick={() => setFavoriteOnly((value) => !value)}
            className="rounded-full border border-secondary bg-primary px-3 py-1.5 text-xs font-semibold text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {favoriteOnly ? "Show everyone" : "Favorite only"}
          </button>
        </div>
      ) : null}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((member) => (
          <li key={member.slug}>
            {member.poBox ? (
              <PoBoxCardClient
                slug={member.slug}
                stageName={member.stageName}
                realName={member.realName}
                accent={member.accent}
                avatarUrl={member.avatarUrl}
                formatted={formatPoBox(member.poBox)}
                commLogo={member.commLogo}
                commName={member.commName}
                poBox={member.poBox}
                isFavorite={member.slug === favoriteSlug}
              />
            ) : (
              <div className="group relative min-h-[112px] overflow-hidden rounded-2xl border border-secondary bg-secondary p-5 pr-24 shadow-xs-skeuomorphic">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={member.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-primary">{member.stageName}</p>
                    <p className="text-sm text-quaternary">No public address yet</p>
                  </div>
                </div>
                <CommunityStamp
                  logo={member.commLogo}
                  name={member.commName}
                  className="absolute right-4 top-4"
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-quaternary">
        “Checked” dates appear only after the team records an address confirmation. If no date appears, confirm before sending anything valuable.
      </p>
    </>
  );
}

function formatPoBox(poBox: PoBox): string {
  return [
    poBox.recipient,
    ...poBox.lines,
    `${poBox.city}, ${poBox.region} ${poBox.postalCode}`,
    poBox.country,
  ].join("\n");
}
