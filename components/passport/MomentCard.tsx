"use client";

import Link from "next/link";
import { CalendarDays, Clock3, Copy, ExternalLink, LockKeyhole, Radio, ShieldCheck, Sparkles } from "lucide-react";
import type { PassportCard } from "@/lib/passport/types";
import { cardSerial, channelAccent, channelLabel, formatPassportDate, passportWitnessKind, provenanceString, safeReplayHref } from "./passport-utils";

export function MomentCardTile({
  card,
  copies = 1,
  selected = false,
  onOpen,
  onSelect,
  compact = false,
}: {
  card: PassportCard;
  copies?: number;
  selected?: boolean;
  onOpen: () => void;
  onSelect?: () => void;
  compact?: boolean;
}) {
  const label = `${card.name}, ${card.rarity} ${card.variant} card`;
  const accent = channelAccent(card.channelSlug);
  const isLiveWitness = passportWitnessKind(card.acquiredVia) === "live";
  return (
    <article className={`moment-card-tile moment-card-tile--${card.rarity} ${compact ? "moment-card-tile--compact" : ""}`}>
      <button
        type="button"
        className="moment-card-tile__face"
        aria-label={`Open ${label}`}
        aria-pressed={onSelect ? selected : undefined}
        onClick={onSelect ?? onOpen}
        style={{ "--moment-accent": accent } as React.CSSProperties}
      >
        <CardArtwork card={card} />
        <span className="moment-card-tile__sheen" aria-hidden="true" />
        <span className="moment-card-tile__topline">
          <span>{channelLabel(card.channelSlug)}</span>
          <span>{card.rarity}</span>
        </span>
        <span className="moment-card-tile__copy">
          {isLiveWitness ? <span className="moment-card-tile__witness"><Radio aria-hidden="true" /> Live witness</span> : null}
          <strong>{card.name}</strong>
          <span>{card.variant || card.editionCode}</span>
        </span>
        <span className="moment-card-tile__serial">{cardSerial(card)}</span>
        {card.state === "locked" || card.state === "escrowed" ? <span className="moment-card-tile__lock" title={card.state === "escrowed" ? "Held safely in trade escrow" : "Locked in your collection"}><LockKeyhole aria-hidden="true" /></span> : null}
        {copies > 1 ? <span className="moment-card-tile__duplicates"><Copy aria-hidden="true" /> ×{copies}</span> : null}
        {selected ? <span className="moment-card-tile__selected">Selected</span> : null}
      </button>
      {onSelect ? <button type="button" className="moment-card-tile__details" onClick={onOpen}>View memory</button> : null}
    </article>
  );
}

function CardArtwork({ card }: { card: PassportCard }) {
  if (card.artworkUrl) {
    return <img className="moment-card-tile__art" src={card.artworkUrl} alt="" loading="lazy" />;
  }
  return (
    <span className="moment-card-tile__placeholder" aria-hidden="true">
      <Sparkles />
      <span>CORE</span>
    </span>
  );
}

export function MomentCardBack({ card }: { card: PassportCard }) {
  const replayHref = safeReplayHref(card);
  const channel = channelLabel(card.channelSlug);
  const momentAt = provenanceString(card, "momentAt") ?? card.acquiredAt;
  const witness = passportWitnessKind(card.acquiredVia);
  const earnedReason = provenanceString(card, "earnedReason") ?? "Earned through verified participation in this CORE event.";
  const personalNote = provenanceString(card, "personalNote");
  return (
    <div className="moment-card-back" style={{ "--moment-accent": channelAccent(card.channelSlug) } as React.CSSProperties}>
      <div className="moment-card-back__hero">
        <CardArtwork card={card} />
        <div>
          <span className={`passport-rarity passport-rarity--${card.rarity}`}>{card.rarity}</span>
          <h3>{card.name}</h3>
          <p>{card.description}</p>
        </div>
      </div>

      <dl className="moment-card-back__facts">
        <div><dt><CalendarDays aria-hidden="true" /> Moment</dt><dd>{formatPassportDate(momentAt)}</dd></div>
        <div><dt><Clock3 aria-hidden="true" /> Earned</dt><dd>{formatPassportDate(card.acquiredAt)}</dd></div>
        <div><dt><Radio aria-hidden="true" /> Witness</dt><dd>{witness === "live" ? "There live" : witness === "replay" ? "Replay witness" : "Official grant"}</dd></div>
        <div><dt><Sparkles aria-hidden="true" /> Edition</dt><dd>{card.variant} · {cardSerial(card)}</dd></div>
      </dl>

      <section className="moment-card-back__story">
        <h4>Your memory</h4>
        <p>{personalNote ?? earnedReason}</p>
      </section>

      <section className="moment-card-back__provenance">
        <h4><ShieldCheck aria-hidden="true" /> Verified provenance</h4>
        <dl>
          <div><dt>Event</dt><dd>{card.eventTitle ?? "CORE event"}</dd></div>
          <div><dt>Channel</dt><dd>{channel}</dd></div>
          <div><dt>Issued by</dt><dd>{provenanceString(card, "issuedBy") ?? "CORE Passport"}</dd></div>
          <div><dt>Qualification</dt><dd>{provenanceString(card, "qualification") ?? earnedReason}</dd></div>
          <div><dt>Ledger</dt><dd title={provenanceString(card, "ledgerId") ?? card.id}>{(provenanceString(card, "ledgerId") ?? card.id).slice(0, 16)}</dd></div>
        </dl>
      </section>

      {replayHref ? (
        <Link href={replayHref as never} className="passport-button passport-button--primary">
          Replay this moment <ExternalLink aria-hidden="true" />
        </Link>
      ) : (
        <p className="passport-inline-note">This moment has no public replay.</p>
      )}
    </div>
  );
}
