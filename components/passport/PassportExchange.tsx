"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, Gift, LockKeyhole, ShieldCheck, Sparkles, X } from "lucide-react";
import type { PassportCard, PassportGift, PassportTrade, PublicPassportProfile } from "@/lib/passport/types";
import { cardSerial, craftablePassportDuplicates, formatPassportDate, formatPassportDateTime, passportTradeActions, passportTradeCardDisplays, type PassportTradeCardDisplay } from "./passport-utils";

type TradeResponse = "accept" | "confirm" | "decline" | "cancel";

export function PassportExchange({
  userId,
  exchangeEnabled,
  cards,
  sparks,
  gifts,
  trades,
  onCraft,
  onGift,
  onGiftResponse,
  onCreateTrade,
  onTradeResponse,
  onSetExchangeEnabled,
  pending,
}: {
  userId: string;
  exchangeEnabled: boolean;
  cards: PassportCard[];
  sparks: number;
  gifts: PassportGift[];
  trades: PassportTrade[];
  onCraft: (cardIds: string[]) => Promise<unknown>;
  onGift: (cardId: string, recipient: string, message?: string) => Promise<unknown>;
  onGiftResponse: (giftId: string, response: "accept" | "decline" | "cancel") => Promise<unknown>;
  onCreateTrade: (recipient: string, offeredCardIds: string[], requestedCardIds: string[], message?: string) => Promise<unknown>;
  onTradeResponse: (tradeId: string, response: TradeResponse) => Promise<unknown>;
  onSetExchangeEnabled: (enabled: boolean) => Promise<unknown>;
  pending: boolean;
}) {
  return (
    <div className="passport-section-stack">
      <section className="passport-section-heading">
        <div>
          <span className="passport-kicker"><ArrowLeftRight aria-hidden="true" /> Collection exchange</span>
          <h2>Safe by design.</h2>
          <p>There is no cash marketplace, blind pack, or gambling mechanic. Gifts require acceptance; trades use escrow and two-party final confirmation.</p>
        </div>
        <div className="passport-sparks"><Sparkles aria-hidden="true" /><span><strong>{sparks.toLocaleString("en-US")}</strong> Sparks</span></div>
      </section>

      <section className="passport-safety-banner"><ShieldCheck aria-hidden="true" /><div><strong>Every transfer has provenance.</strong><p>Account-bound, locked, revoked, or already escrowed cards cannot be moved. You can cancel before settlement.</p></div></section>

      <section className="passport-exchange-access" aria-labelledby="passport-exchange-access-title">
        <div><LockKeyhole aria-hidden="true" /><span><strong id="passport-exchange-access-title">Let members find me for exchanges</strong><small>Off by default. When enabled, signed-in members can use your public @handle to send a gift or propose a trade. Your email and private inventory stay hidden.</small></span></div>
        <label><input type="checkbox" role="switch" checked={exchangeEnabled} disabled={pending} onChange={(event) => void onSetExchangeEnabled(event.target.checked).catch(() => {})} /><span>{exchangeEnabled ? "Exchange invitations on" : "Exchange invitations off"}</span></label>
      </section>

      <div className="passport-exchange-grid">
        <CraftPanel cards={cards} onCraft={onCraft} pending={pending} />
        <GiftPanel cards={cards} onGift={onGift} pending={pending} />
      </div>

      <GiftInbox userId={userId} gifts={gifts} onResponse={onGiftResponse} pending={pending} />
      <TradeDesk userId={userId} cards={cards} trades={trades} onCreate={onCreateTrade} onResponse={onTradeResponse} pending={pending} />
    </div>
  );
}

function CraftPanel({ cards, onCraft, pending }: { cards: PassportCard[]; onCraft: (cardIds: string[]) => Promise<unknown>; pending: boolean }) {
  const duplicates = useMemo(() => craftablePassportDuplicates(cards), [cards]);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const craftable = duplicates.filter((card) => selected.includes(card.id));

  return (
    <section className="passport-exchange-panel">
      <header><span><Sparkles aria-hidden="true" /></span><div><h3>Craft three common duplicates</h3><p>Keep one copy of every edition, then convert exactly three active, craft-eligible common extras into Sparks.</p></div></header>
      {duplicates.length ? <div className="passport-card-list">{duplicates.map((card) => { const isSelected = selected.includes(card.id); return <label key={card.id}><input type="checkbox" checked={isSelected} disabled={!isSelected && selected.length >= 3} onChange={() => { setSelected((current) => isSelected ? current.filter((id) => id !== card.id) : current.length < 3 ? [...current, card.id] : current); setConfirmed(false); }} /><span><strong>{card.name}</strong><small>{card.variant} · {cardSerial(card)}{card.accountBound ? " · account-bound" : ""}</small></span><Sparkles aria-hidden="true" /></label>; })}</div> : <p className="passport-inline-note">You have no eligible common duplicates yet. Non-active and zero-value cards remain protected.</p>}
      {selected.length ? <label className="passport-confirm-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I understand crafting permanently retires these {selected.length} card {selected.length === 1 ? "copy" : "copies"}.</span></label> : null}
      <button type="button" className="passport-button passport-button--primary" disabled={craftable.length !== 3 || !confirmed || pending} onClick={() => void onCraft(craftable.map((card) => card.id)).then(() => { setSelected([]); setConfirmed(false); }).catch(() => {})}><Sparkles aria-hidden="true" /> Craft {selected.length}/3 duplicates</button>
    </section>
  );
}

function GiftPanel({ cards, onGift, pending }: { cards: PassportCard[]; onGift: (cardId: string, recipient: string, message?: string) => Promise<unknown>; pending: boolean }) {
  const giftable = cards.filter((card) => card.giftable && !card.accountBound && card.state === "active");
  const [cardId, setCardId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  return (
    <section className="passport-exchange-panel">
      <header><span><Gift aria-hidden="true" /></span><div><h3>Send a safe gift</h3><p>The card stays yours until the recipient accepts. Unaccepted gifts expire automatically.</p></div></header>
      <div className="passport-form-stack">
        <label><span>Card</span><select value={cardId} onChange={(event) => setCardId(event.target.value)}><option value="">Choose a giftable card</option>{giftable.map((card) => <option key={card.id} value={card.id}>{card.name} · {cardSerial(card)}</option>)}</select></label>
        <label><span>Recipient handle</span><input value={recipient} onChange={(event) => setRecipient(event.target.value.replace(/^@/, "").slice(0, 40))} placeholder="corefan" autoComplete="off" /></label>
        <label><span>Message <small>optional</small></span><textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0, 240))} placeholder="Why this memory belongs with them…" rows={3} /></label>
      </div>
      <button type="button" className="passport-button passport-button--primary" disabled={!cardId || recipient.trim().length < 2 || pending} onClick={() => void onGift(cardId, recipient.trim(), message.trim() || undefined).then(() => { setCardId(""); setRecipient(""); setMessage(""); }).catch(() => {})}><Gift aria-hidden="true" /> Send gift invitation</button>
    </section>
  );
}

function GiftInbox({ userId, gifts, onResponse, pending }: { userId: string; gifts: PassportGift[]; onResponse: (giftId: string, response: "accept" | "decline" | "cancel") => Promise<unknown>; pending: boolean }) {
  if (!gifts.length) return null;
  return (
    <section className="passport-ledger-section">
      <header><h3>Gift invitations</h3><p>Nothing transfers until it is accepted.</p></header>
      <div className="passport-ledger-list">{gifts.map((gift) => { const incoming = gift.recipientUserId === userId; const pendingGift = gift.state === "pending"; return <article key={gift.id}><span className="passport-ledger-icon"><Gift aria-hidden="true" /></span><div><span>{incoming ? `From ${gift.senderName}` : `To ${gift.recipientName}`} · expires {formatPassportDate(gift.expiresAt)}</span><h4>{gift.cardName}</h4>{gift.message ? <p>“{gift.message}”</p> : null}<small className={`passport-state passport-state--${gift.state}`}>{gift.state}</small></div>{pendingGift ? <div className="passport-ledger-actions">{incoming ? <><button type="button" disabled={pending} onClick={() => void onResponse(gift.id, "accept").catch(() => {})}><Check aria-hidden="true" /> Accept</button><button type="button" disabled={pending} onClick={() => void onResponse(gift.id, "decline").catch(() => {})}><X aria-hidden="true" /> Decline</button></> : <button type="button" disabled={pending} onClick={() => void onResponse(gift.id, "cancel").catch(() => {})}><X aria-hidden="true" /> Cancel</button>}</div> : null}</article>; })}</div>
    </section>
  );
}

function TradeDesk({ userId, cards, trades, onCreate, onResponse, pending }: { userId: string; cards: PassportCard[]; trades: PassportTrade[]; onCreate: (recipient: string, offered: string[], requested: string[], message?: string) => Promise<unknown>; onResponse: (tradeId: string, response: TradeResponse) => Promise<unknown>; pending: boolean }) {
  const tradeable = cards.filter((card) => card.tradeable && !card.accountBound && card.state === "active");
  const [recipient, setRecipient] = useState("");
  const [offered, setOffered] = useState<string[]>([]);
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
  const [binder, setBinder] = useState<PublicPassportProfile | null>(null);
  const [binderHandle, setBinderHandle] = useState("");
  const [binderLoading, setBinderLoading] = useState(false);
  const [binderError, setBinderError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [safe, setSafe] = useState(false);
  const normalizedRecipient = recipient.trim();
  const binderVisible = binderHandle === normalizedRecipient ? binder : null;
  const binderCards = (binderVisible?.showcase ?? []).filter(
    (card) => card.tradeable && !card.accountBound && card.state === "active",
  );

  const loadPublicBinder = async () => {
    if (normalizedRecipient.length < 2 || binderLoading) return;
    const handle = normalizedRecipient;
    setBinderLoading(true);
    setBinderError(null);
    setBinder(null);
    setBinderHandle(handle);
    setRequestedIds([]);
    setSafe(false);
    try {
      const response = await fetch(`/api/account/passport/public/${encodeURIComponent(handle)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as (PublicPassportProfile & { error?: string; message?: string }) | null;
      if (!response.ok || !payload) {
        throw new Error(response.status === 429
          ? "Too many binder requests. Wait a moment and try again."
          : "This member's binder is private or unavailable.");
      }
      setBinder(payload);
    } catch (error) {
      setBinderError(error instanceof Error ? error.message : "This member's binder is private or unavailable.");
    } finally {
      setBinderLoading(false);
    }
  };

  return (
    <section className="passport-trade-desk">
      <header><div><span className="passport-kicker"><ArrowLeftRight aria-hidden="true" /> Escrow trades</span><h2>Both sides see the exact deal.</h2><p>Acceptance begins the review stage. Settlement only occurs after both people confirm the unchanged trade.</p></div></header>
      <div className="passport-exchange-grid">
        <div className="passport-exchange-panel">
          <div className="passport-form-stack">
            <div className="passport-binder-loader">
              <label><span>Trade with</span><input value={recipient} onChange={(event) => { setRecipient(event.target.value.replace(/^@/, "").slice(0, 40)); setBinder(null); setBinderHandle(""); setBinderError(null); setRequestedIds([]); setSafe(false); }} placeholder="Member handle" autoComplete="off" /></label>
              <button type="button" className="passport-button" disabled={normalizedRecipient.length < 2 || binderLoading} onClick={() => void loadPublicBinder()}>{binderLoading ? "Loading…" : "Load public binder"}</button>
            </div>
            <fieldset className="passport-trade-card-picker"><legend>Your offer · up to 6 cards</legend>{tradeable.map((card) => { const selected = offered.includes(card.id); return <label key={card.id} className={selected ? "is-selected" : ""}><input type="checkbox" checked={selected} onChange={() => { setOffered((current) => selected ? current.filter((id) => id !== card.id) : [...current, card.id].slice(-6)); setSafe(false); }} /><span><strong>{card.name}</strong><small>{cardSerial(card)}</small></span></label>; })}</fieldset>
            {binderCards.length ? <fieldset className="passport-trade-card-picker passport-binder-picker"><legend>Request from @{binderHandle} · up to 6 cards</legend>{binderCards.map((card) => { const selected = requestedIds.includes(card.id); return <label key={card.id} className={selected ? "is-selected" : ""}><input type="checkbox" checked={selected} onChange={() => { setRequestedIds((current) => selected ? current.filter((id) => id !== card.id) : [...current, card.id].slice(-6)); setSafe(false); }} />{card.artworkUrl ? <img src={card.artworkUrl} alt="" loading="lazy" /> : <span className="passport-binder-placeholder"><Sparkles aria-hidden="true" /></span>}<span><strong>{card.name}</strong><small>{card.variant} · {cardSerial(card)}</small></span></label>; })}</fieldset> : null}
            {binderVisible && !binderCards.length ? <p className="passport-inline-note" role="status">@{binderHandle} has no transferable cards in their public showcase right now.</p> : null}
            {binderError ? <p className="passport-inline-note passport-inline-note--error" role="alert">{binderError}</p> : null}
            <label><span>Message <small>optional</small></span><textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0, 240))} rows={2} /></label>
            <label className="passport-confirm-check"><input type="checkbox" checked={safe} onChange={(event) => setSafe(event.target.checked)} /><span>This trade does not involve cash, off-site payment, or a promise outside CORE.</span></label>
          </div>
          <button type="button" className="passport-button passport-button--primary" disabled={normalizedRecipient.length < 2 || !offered.length || !requestedIds.length || !safe || pending} onClick={() => void onCreate(normalizedRecipient, offered, requestedIds, message.trim() || undefined).then(() => { setRecipient(""); setOffered([]); setRequestedIds([]); setBinder(null); setBinderHandle(""); setBinderError(null); setMessage(""); setSafe(false); }).catch(() => {})}><LockKeyhole aria-hidden="true" /> Propose with escrow</button>
        </div>
        <div className="passport-trade-rules"><AlertTriangle aria-hidden="true" /><h3>Before you confirm</h3><ul><li>Check every card, serial, and variant.</li><li>CORE will never ask you to pay to finish a trade.</li><li>A changed offer clears every prior confirmation.</li><li>Cancel immediately if someone pressures you off-site.</li></ul></div>
      </div>
      {trades.length ? <div className="passport-ledger-list passport-trade-list">{trades.map((trade) => <TradeRow key={trade.id} userId={userId} trade={trade} cards={cards} pending={pending} onResponse={onResponse} />)}</div> : null}
    </section>
  );
}

function TradeRow({ userId, trade, cards, pending, onResponse }: { userId: string; trade: PassportTrade; cards: PassportCard[]; pending: boolean; onResponse: (tradeId: string, response: TradeResponse) => Promise<unknown> }) {
  const actions = passportTradeActions(trade, userId);
  const offered = passportTradeCardDisplays(trade.offeredCardIds, trade.offeredCards, cards);
  const requested = passportTradeCardDisplays(trade.requestedCardIds, trade.requestedCards, cards);
  const stateLabel = trade.state.replaceAll("_", " ");
  return (
    <article>
      <span className="passport-ledger-icon"><ArrowLeftRight aria-hidden="true" /></span>
      <div className="passport-trade-summary"><span>{actions.incoming ? `From ${trade.proposerName}` : `With ${trade.recipientName}`} · expires {formatPassportDate(trade.expiresAt)}</span><h4>{trade.proposerName} <ArrowLeftRight aria-hidden="true" /> {trade.recipientName}</h4><div className="passport-trade-card-sides"><TradeCardList label={`${trade.proposerName} offers`} cards={offered} /><TradeCardList label={`${trade.recipientName} offers`} cards={requested} /></div>{trade.message ? <p>{trade.message}</p> : null}{trade.state === "cooling_off" && trade.executesAt ? <p className="passport-trade-cooling"><ShieldCheck aria-hidden="true" /> Both sides confirmed. Settlement is cooling off until {formatPassportDateTime(trade.executesAt)}; either side can still cancel.</p> : null}<div className="passport-trade-confirmations"><small className={trade.proposerConfirmed ? "is-done" : ""}>{trade.proposerConfirmed ? <Check aria-hidden="true" /> : <span />} Proposer confirmed</small><small className={trade.recipientConfirmed ? "is-done" : ""}>{trade.recipientConfirmed ? <Check aria-hidden="true" /> : <span />} Recipient confirmed</small></div><small className={`passport-state passport-state--${trade.state}`}>{stateLabel}</small></div>
      <div className="passport-ledger-actions">{actions.canAccept ? <button type="button" disabled={pending} onClick={() => void onResponse(trade.id, "accept").catch(() => {})}><Check aria-hidden="true" /> Review & accept</button> : null}{actions.canDecline ? <button type="button" disabled={pending} onClick={() => void onResponse(trade.id, "decline").catch(() => {})}><X aria-hidden="true" /> Decline</button> : null}{actions.canConfirm ? <button type="button" className="is-primary" disabled={pending} onClick={() => void onResponse(trade.id, "confirm").catch(() => {})}><ShieldCheck aria-hidden="true" /> Final confirm</button> : null}{actions.canCancel && !actions.canDecline ? <button type="button" disabled={pending} onClick={() => void onResponse(trade.id, "cancel").catch(() => {})}><X aria-hidden="true" /> Cancel</button> : null}</div>
    </article>
  );
}

function TradeCardList({ label, cards }: { label: string; cards: PassportTradeCardDisplay[] }) {
  return (
    <section aria-label={label}>
      <span>{label}</span>
      <ul>{cards.map((card) => <li key={card.id}>{card.artworkUrl ? <img src={card.artworkUrl} alt="" loading="lazy" /> : <span className="passport-trade-card-placeholder"><Sparkles aria-hidden="true" /></span>}<div><strong>{card.name}</strong><small>{card.legacyFallback ? card.variant : `${card.variant} · ${cardSerial(card)}`}</small></div></li>)}</ul>
    </section>
  );
}
