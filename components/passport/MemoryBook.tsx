"use client";

import { useMemo, useState } from "react";
import { BookOpen, Check, Grid2X2, History, ListFilter, Search, Sparkles } from "lucide-react";
import type { PassportAlbum, PassportCard, PassportRarity } from "@/lib/passport/types";
import type { PassportInventoryState } from "@/hooks/passport/usePassportInventory";
import { MomentCardBack, MomentCardTile } from "./MomentCard";
import { PassportDialog } from "./PassportDialog";
import { boundedPercent, filterCards, formatPassportDate } from "./passport-utils";

type MemoryView = "grid" | "timeline";

export function MemoryBook({
  inventory,
  albums,
  onClaimAlbum,
  claimingAlbum,
}: {
  inventory: PassportInventoryState;
  albums: PassportAlbum[];
  onClaimAlbum?: (albumId: string) => Promise<unknown>;
  claimingAlbum?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const [rarity, setRarity] = useState<PassportRarity | "all">("all");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [view, setView] = useState<MemoryView>("grid");
  const [selectedCard, setSelectedCard] = useState<PassportCard | null>(null);
  const inventoryCards = inventory.cards;

  const channels = useMemo(
    () => Array.from(new Set(inventoryCards.map((card) => card.channelSlug))).sort(),
    [inventoryCards],
  );
  const filtered = useMemo(
    () => filterCards(inventoryCards, { query, channel, rarity, duplicatesOnly }),
    [channel, duplicatesOnly, inventoryCards, query, rarity],
  );
  const timeline = useMemo(() => {
    const groups = new Map<string, PassportCard[]>();
    for (const card of filtered) {
      const date = new Date(card.acquiredAt);
      const key = Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date)
        : "Earlier memories";
      groups.set(key, [...(groups.get(key) ?? []), card]);
    }
    return Array.from(groups.entries());
  }, [filtered]);
  const copiesByEdition = useMemo(() => {
    const copies = new Map<string, number>();
    for (const card of inventoryCards) {
      const key = `${card.editionId}:${card.variant}`;
      copies.set(key, (copies.get(key) ?? 0) + 1);
    }
    return copies;
  }, [inventoryCards]);

  return (
    <div className="passport-section-stack">
      <section className="passport-section-heading">
        <div>
          <span className="passport-kicker"><BookOpen aria-hidden="true" /> Digital Memory Book</span>
          <h2>Your verified records, kept together.</h2>
          <p>Open a record to see its source, earned date, account history, and replay details when available.</p>
        </div>
        <div className="passport-segment" aria-label="Memory book view">
          <button type="button" className={view === "grid" ? "is-active" : ""} onClick={() => setView("grid")} aria-pressed={view === "grid"}><Grid2X2 aria-hidden="true" /> Grid</button>
          <button type="button" className={view === "timeline" ? "is-active" : ""} onClick={() => setView("timeline")} aria-pressed={view === "timeline"}><History aria-hidden="true" /> Timeline</button>
        </div>
      </section>

      <section className="passport-filter-bar" aria-label="Filter Memory Book">
        <label className="passport-search-field">
          <Search aria-hidden="true" />
          <span className="sr-only">Search cards</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search moments, events, or tags" />
        </label>
        <label>
          <span className="sr-only">Channel</span>
          <select value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="all">All channels</option>
            {channels.map((slug) => <option key={slug} value={slug}>{slug.replaceAll("-", " ")}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Rarity</span>
          <select value={rarity} onChange={(event) => setRarity(event.target.value as PassportRarity | "all")}>
            <option value="all">All editions</option>
            <option value="common">Common</option>
            <option value="rare">Rare</option>
            <option value="historic">Historic</option>
            <option value="legendary">Legendary</option>
          </select>
        </label>
        <button type="button" className={`passport-filter-toggle ${duplicatesOnly ? "is-active" : ""}`} onClick={() => setDuplicatesOnly((value) => !value)} aria-pressed={duplicatesOnly}>
          <ListFilter aria-hidden="true" /> Duplicates
        </button>
      </section>

      <p className="passport-result-count" aria-live="polite">Showing {filtered.length} of {inventoryCards.length} loaded memories{inventory.loading ? " · checking your full collection…" : ""}</p>

      {filtered.length === 0 ? (
        <div className="passport-empty">
          <Sparkles aria-hidden="true" />
          <h3>No memories match those filters.</h3>
          <p>Clear a filter or earn your next card by joining an official CORE event.</p>
          <button type="button" className="passport-button" onClick={() => { setQuery(""); setChannel("all"); setRarity("all"); setDuplicatesOnly(false); }}>Clear filters</button>
        </div>
      ) : view === "grid" ? (
        <div className="memory-book-grid">
          {filtered.map((card) => <MomentCardTile key={card.id} card={card} copies={copiesByEdition.get(`${card.editionId}:${card.variant}`) ?? 1} onOpen={() => setSelectedCard(card)} />)}
        </div>
      ) : (
        <div className="memory-timeline">
          {timeline.map(([month, monthCards]) => (
            <section key={month} className="memory-timeline__group">
              <header><span aria-hidden="true" /><div><h3>{month}</h3><p>{monthCards.length} {monthCards.length === 1 ? "memory" : "memories"}</p></div></header>
              <div className="memory-timeline__cards">
                {monthCards.map((card) => (
                  <article key={card.id} className="memory-timeline__entry">
                    <MomentCardTile card={card} compact onOpen={() => setSelectedCard(card)} />
                    <button type="button" onClick={() => setSelectedCard(card)}>
                      <span>{formatPassportDate(card.acquiredAt)} · {card.channelSlug.replaceAll("-", " ")}</span>
                      <strong>{card.name}</strong>
                      <small>{typeof card.provenance.earnedReason === "string" ? card.provenance.earnedReason : card.description}</small>
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="memory-book-pagination" aria-live="polite">
        {inventory.error ? <p>{inventory.error} <button type="button" onClick={() => void inventory.reload()}>Try again</button></p> : null}
        {inventory.hasMore ? <button type="button" className="passport-button" disabled={inventory.loadingMore} onClick={() => void inventory.loadMore()}>{inventory.loadingMore ? "Loading memories…" : "Load more memories"}</button> : !inventory.loading && inventoryCards.length ? <span>Full Memory Book loaded · {inventoryCards.length} cards</span> : null}
      </div>

      <Albums albums={albums} onClaim={onClaimAlbum} pending={claimingAlbum} />

      <PassportDialog
        open={Boolean(selectedCard)}
        title={selectedCard?.name ?? "Verified record"}
        description="The verified details behind this record."
        onClose={() => setSelectedCard(null)}
        wide
      >
        {selectedCard ? <MomentCardBack card={selectedCard} /> : null}
      </PassportDialog>
    </div>
  );
}

function Albums({
  albums,
  onClaim,
  pending,
}: {
  albums: PassportAlbum[];
  onClaim?: (albumId: string) => Promise<unknown>;
  pending?: boolean;
}) {
  if (!albums.length) return null;
  return (
    <section className="passport-albums">
      <div className="passport-section-heading">
        <div>
          <span className="passport-kicker"><Sparkles aria-hidden="true" /> Collection albums</span>
          <h2>Complete the whole story.</h2>
          <p>Collections group records by creator, event, and other categories tracked by CORE.</p>
        </div>
      </div>
      <div className="passport-album-grid">
        {albums.map((album) => {
          const complete = album.complete || album.collected >= album.required;
          const claimable = complete && !album.claimed;
          return (
            <article key={album.code} className="passport-album">
              <div className="passport-album__cover">{album.artworkUrl ? <img src={album.artworkUrl} alt="" loading="lazy" /> : <BookOpen aria-hidden="true" />}<span>{album.collected}/{album.required}</span></div>
              <div className="passport-album__copy">
                <span>{complete ? <><Check aria-hidden="true" /> Set complete</> : `${Math.max(0, album.required - album.collected)} cards left`}</span>
                <h3>{album.name}</h3>
                <p>{album.description}</p>
                <div className="passport-progress"><span style={{ width: `${boundedPercent(album.collected, album.required)}%` }} /></div>
                <small>Reward: {typeof album.reward.label === "string" ? album.reward.label : "Album cosmetic"}</small>
                {claimable && onClaim ? <button type="button" className="passport-button passport-button--small" disabled={pending} onClick={() => void onClaim(album.code).catch(() => {})}>Claim completion reward</button> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
