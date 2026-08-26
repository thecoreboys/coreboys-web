import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { buildLoyaltyCard, listLoyalty } from "@/lib/oauth/loyalty";
import { listConnections } from "@/lib/oauth/connections";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { Badge } from "@/components/base/badges/badges";
import { MEMBERS } from "@/lib/members";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import { getPublicPassportProfile } from "@/lib/passport/read";
import { PublicPassportShowcase } from "@/components/passport/PublicPassportShowcase";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `@${handle} — CORE fan`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicFanCardPage({ params }: Params) {
  const { handle } = await params;
  const slug = handle.toLowerCase();
  const { rows } = await query<{
    id: string;
    display_name: string;
    favorite_member: string | null;
  }>(
    `SELECT id, display_name, favorite_member
       FROM fan_users
      WHERE public_card = true AND public_slug = $1`,
    [slug],
  );
  const user = rows[0];
  if (!user) notFound();

  const viewerUserId = await getCurrentFanUserId();
  const [facts, connections, passport] = await Promise.all([
    listLoyalty(user.id),
    listConnections(user.id),
    getPublicPassportProfile(slug, viewerUserId).catch(() => null),
  ]);
  const card = buildLoyaltyCard(facts, user.favorite_member);
  const fav = MEMBERS.find((m) => m.slug === card.favoriteSlug);

  return (
    <>
      <main className="mx-auto max-w-lg px-6 py-20">
        <p className="text-sm font-semibold text-brand-secondary">Fan card</p>
        <h1 className="mt-2 text-display-sm font-semibold tracking-tight text-primary">
          {user.display_name}
        </h1>
        <p className="mt-1 text-sm text-tertiary">@{slug}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {connections.map((c) => (
            <Badge key={c.provider} color="gray" size="md">
              {c.provider}
              {c.username ? ` · @${c.username}` : ""}
            </Badge>
          ))}
          {card.houseStatus === "super" ? (
            <Badge color="brand" size="md">House Super</Badge>
          ) : null}
        </div>
        <dl className="mt-8 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-secondary p-4 ring-1 ring-inset ring-secondary">
            <dt className="text-xs text-quaternary">Loyalty</dt>
            <dd className="text-lg font-semibold tabular-nums text-primary">
              {card.completion.done}/{card.completion.total}
            </dd>
          </div>
          <div className="rounded-xl bg-secondary p-4 ring-1 ring-inset ring-secondary">
            <dt className="text-xs text-quaternary">Closest to</dt>
            <dd className="text-lg font-semibold text-primary">{fav?.stageName ?? "—"}</dd>
          </div>
        </dl>
        {passport ? <PublicPassportShowcase passport={passport} /> : null}
      </main>
      <SiteFooter />
    </>
  );
}
