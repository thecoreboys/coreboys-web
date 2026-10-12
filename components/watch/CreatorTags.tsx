"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { ChevronDown, ExternalLink, LockKeyhole, ScanText, Search, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { activeCreatorTags, matchCreatorText, normalizeCreatorText, verifiedCreatorAvatar, videoRectangle, type CreatorBox, type CreatorProfile, type CreatorTagPayload } from "@/lib/creator-tags/model";
import styles from "./CreatorTags.module.css";
import { useSubscription } from "@/hooks/useSubscription";
import { SocialIcon } from "@/components/ui/SocialIcon";

const empty: CreatorTagPayload = { creators: [], tags: [], mentions: [] };
const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
function CreatorAvatar({ creator }: { creator: CreatorProfile }) {
  const [failed, setFailed] = useState<string | null>(null);
  const image = creator.avatarUrl && verifiedCreatorAvatar(creator.avatarUrl) && failed !== creator.avatarUrl ? creator.avatarUrl : null;
  return <span className={styles.avatar} aria-hidden="true">{image ? <Image src={image} alt="" width={40} height={40} unoptimized referrerPolicy="no-referrer" onError={() => setFailed(image)} />
    : <span>{creator.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>}</span>;
}
function SocialLinks({ creator, compact = false }: { creator: CreatorProfile; compact?: boolean }) {
  return <div className={compact ? styles.socialIcons : styles.socials}>{creator.socials.map((link) => {
    const label = link.platform === "x" ? "X" : link.platform === "youtube" ? "YouTube" : link.platform === "tiktok" ? "TikTok" : link.platform.charAt(0).toUpperCase() + link.platform.slice(1);
    const title = `${creator.name} on ${label} (${new URL(link.url).pathname})`;
    return <a key={link.url} href={link.url} title={title} aria-label={compact ? title : undefined} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>
      {compact ? link.platform === "kick" ? <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z" /></svg> : <SocialIcon platform={link.platform} size={15} /> : <>{label} <ExternalLink size={12} aria-hidden /></>}
    </a>;
  })}</div>;
}

export function CreatorTags({ assetKey, title, getTime, mediaRef, fit = "contain", sourceRatio = 16 / 9, compact = false, liveStartedAt }: {
  assetKey: string; title: string; getTime: () => number | null; mediaRef?: RefObject<HTMLVideoElement | null>;
  fit?: "contain" | "cover"; sourceRatio?: number; compact?: boolean; liveStartedAt?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const reader = useRef(getTime); reader.current = getTime;
  const subscription = useSubscription();
  const memberAllowed = subscription.hasFeature("player.creator_tags");
  const [accessBlocked, setAccessBlocked] = useState(false);
  const loaded = memberAllowed && !accessBlocked;
  const [data, setData] = useState<CreatorTagPayload>(empty);
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [box, setBox] = useState<CreatorBox | null>(null);
  const anchor = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const [time, setTime] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [geometry, setGeometry] = useState({ x: 0, y: 0, width: 1, height: 1 });
  const [panelPinned, setPanelPinned] = useState(false);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [panelMaxHeight, setPanelMaxHeight] = useState(0);
  const sequence = useRef(0);
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setData(empty); setSnapshotReady(false); setOpen(false); setSelecting(false); setBox(null); setQuery(""); setMessage(""); setPanelPinned(false); setSelectedTime(null); setTime(null);
    sequence.current++;
    const host = root.current?.parentElement;
    setHovered(host?.matches(":hover") ?? false);
    const enter = () => setHovered(true), leave = () => setHovered(false);
    host?.addEventListener("pointerenter", enter);
    host?.addEventListener("pointerleave", leave);
    host?.addEventListener("focusin", enter);
    const blur = (event: FocusEvent) => { if (!host?.contains(event.relatedTarget as Node | null)) leave(); };
    host?.addEventListener("focusout", blur);
    return () => { host?.removeEventListener("pointerenter", enter); host?.removeEventListener("pointerleave", leave); host?.removeEventListener("focusin", enter); host?.removeEventListener("focusout", blur); };
  }, [assetKey, liveStartedAt]);

  useEffect(() => {
    setAccessBlocked(false);
    if (!memberAllowed) { setData(empty); setSnapshotReady(false); setSelecting(false); setPanelPinned(false); }
  }, [memberAllowed]);

  useEffect(() => {
    if (!loaded) return;
    let controller: AbortController | null = null;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort(); controller = new AbortController();
      const currentSequence = ++sequence.current;
      try {
        const params = new URLSearchParams({ assetKey });
        if (liveStartedAt) params.set("liveStartedAt", liveStartedAt);
        const response = await fetch(`/api/watch/creator-tags?${params}`, { signal: controller.signal, cache: "no-store" });
        const value = await response.json();
        if (currentSequence !== sequence.current) return;
        if (response.status === 401 || response.status === 403) { setData(empty); setAccessBlocked(true); setSelecting(false); return; }
        if (response.ok && Array.isArray(value.creators) && Array.isArray(value.tags)) { setData(value); setSnapshotReady(true); if (value.unavailable) setMessage("Video tags are temporarily unavailable. Name lookup still works."); }
        else setMessage("Creator tags could not load. Try again shortly.");
      } catch { /* Tags enhance playback; network failure never interrupts video. */ }
    };
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    const onVisibility = () => { if (document.visibilityState !== "visible") { controller?.abort(); sequence.current++; setData(empty); } else void load(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { controller?.abort(); sequence.current++; clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
  }, [assetKey, liveStartedAt, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const update = () => setTime(document.visibilityState === "visible" ? reader.current() : null);
    update(); const timer = window.setInterval(update, 200);
    return () => clearInterval(timer);
  }, [loaded, assetKey]);

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const update = () => {
      const video = mediaRef?.current;
      setPanelMaxHeight(Math.max(0, host.clientHeight - (compact ? 190 : 128)));
      setGeometry(videoRectangle({ width: host.clientWidth, height: host.clientHeight },
        { width: video?.videoWidth || sourceRatio, height: video?.videoHeight || 1 }, fit));
    };
    update(); const observer = new ResizeObserver(update); observer.observe(host);
    mediaRef?.current?.addEventListener("loadedmetadata", update);
    return () => { observer.disconnect(); mediaRef?.current?.removeEventListener("loadedmetadata", update); };
  }, [assetKey, mediaRef, fit, sourceRatio, compact]);

  const named = matchCreatorText(title, data.creators);
  const textMatches = matchCreatorText(query, data.creators);
  const normalizedQuery = normalizeCreatorText(query);
  const matches = normalizedQuery ? data.creators.filter((creator) => creator.active && (textMatches.some((entry) => entry.id === creator.id) || [creator.name, ...creator.aliases].some((alias) => normalizeCreatorText(alias).includes(normalizedQuery)))).slice(0, 12)
    : [...new Map([...named, ...data.mentions.map((entry) => data.creators.find((creator) => creator.id === entry.creatorId)).filter((creator): creator is CreatorProfile => Boolean(creator))].map((creator) => [creator.id, creator])).values()];
  const tags = loaded && visible ? activeCreatorTags(data.tags, time) : [];
  const currentCreators = [...new Map(tags.map((tag) => data.creators.find((creator) => creator.id === tag.creatorId))
    .filter((creator): creator is CreatorProfile => Boolean(creator)).map((creator) => [creator.id, creator])).values()];
  const panelHasRoom = panelMaxHeight >= 60;
  const panelExpanded = panelHasRoom && !open && !selecting && (hovered || panelPinned);
  const search = () => { setSelectedTime(reader.current()); setMessage(""); setOpen(true); };
  const select = () => { setOpen(false); setSelecting(true); setBox(null); setSelectedTime(reader.current()); };

  function point(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width - geometry.x) / geometry.width)),
      y: Math.max(0, Math.min(1, ((event.clientY - rect.top) / rect.height - geometry.y) / geometry.height)) };
  }
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    anchor.current = { ...point(event), pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedTime(reader.current()); setMessage(""); setBox(null);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!anchor.current || anchor.current.pointerId !== event.pointerId) return;
    const end = point(event), start = anchor.current;
    setBox({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) });
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!anchor.current || anchor.current.pointerId !== event.pointerId) return;
    const start = anchor.current, end = point(event);
    const selected = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
    event.stopPropagation(); anchor.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (selected.width < .005 || selected.height < .005) { setBox(null); return; }
    setBox(selected);
    // Store normalized placement only. No image capture, upload, model call or face processing.
    setMessage("Position selected. Choose the creator’s name to submit this tag for review.");
    setSelecting(false); setOpen(true);
  }
  async function suggest(creator: CreatorProfile) {
    const at = selectedTime ?? time;
    if (at == null) { setMessage("Open a replay to suggest a timed creator tag. Profile lookup remains available during live streams."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/watch/creator-tags/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetKey, creatorId: creator.id,
        startSeconds: Math.floor(at), endSeconds: Math.floor(at) + 5, box, liveStartedAt, evidenceKind: "manual", evidence: `Viewer selected ${creator.name} at ${stamp(at)}` }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setMessage("Tag submitted for review.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Tag could not be submitted."); }
    finally { setBusy(false); }
  }

  const boxStyle = (b: CreatorBox) => ({ left: `${(geometry.x + b.x * geometry.width) * 100}%`, top: `${(geometry.y + b.y * geometry.height) * 100}%`, width: `${b.width * geometry.width * 100}%`, height: `${b.height * geometry.height * 100}%` });
  useEffect(() => {
    if (!selecting) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") { setSelecting(false); anchor.current = null; setBox(null); } };
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [selecting]);
  return <div ref={root} className={styles.overlay} data-creator-tags data-active={panelExpanded ? "true" : undefined} data-compact={compact ? "true" : undefined} data-cursor-native onKeyDown={(event) => { if (event.key === "Escape") { setSelecting(false); setPanelPinned(false); setHovered(false); } }}>
    <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
      <button type="button" className={styles.panelTrigger} aria-label="Show on-screen creators" disabled={!panelHasRoom} title={panelHasRoom ? undefined : "Expand this player to see creator tags"} aria-expanded={panelExpanded} aria-pressed={panelPinned} onClick={() => { setPanelPinned((pinned) => !pinned); setHovered(false); }}>
        <Users size={15} aria-hidden /><span>On screen</span>{loaded && currentCreators.length ? <span className={styles.count}>{currentCreators.length}</span> : null}{!loaded && !subscription.loading ? <LockKeyhole size={12} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
      </button>
      <section className={styles.panelBody} aria-label="On-screen creators" hidden={!panelExpanded} style={{ maxHeight: panelMaxHeight }}>
        {loaded ? <>
          {currentCreators.length ? <ul className={styles.people}>{currentCreators.map((creator) => <li key={creator.id}>
            <a className={styles.person} href={creator.socials[0]?.url} target="_blank" rel="noopener noreferrer"><CreatorAvatar creator={creator} /><span>{creator.name}</span><ExternalLink size={12} aria-hidden /></a>
            <SocialLinks creator={creator} compact />
          </li>)}</ul> : <p className={styles.panelEmpty}>{!visible ? "Creator tags are hidden." : !snapshotReady ? message || "Loading creator tags…" : time == null ? "Timed creator tags are available in replays." : "No confirmed tags for this moment."}</p>}
          {!visible ? <button type="button" className={styles.panelAction} onClick={() => setVisible(true)}>Show tags</button> : null}
          <div className={styles.panelActions}><button type="button" onClick={search}><Search size={14} aria-hidden /> Find a creator</button><button type="button" onClick={select} disabled={time == null}><ScanText size={14} aria-hidden /> Add tag</button></div>
        </> : <><p className={styles.panelEmpty}>{subscription.loading ? "Loading membership…" : "Creator tags are included with CORE Membership."}</p>{!subscription.loading ? <a className={styles.panelAction} href={subscription.featureHref("player.creator_tags")}>{subscription.signedIn ? "View membership" : "Sign in"}</a> : null}</>}
      </section>
    </div>
    {selecting && loaded ? <div className={styles.selection} role="region" aria-label="Drag to place a creator tag" onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { anchor.current = null; setBox(null); }} onClick={(event) => event.stopPropagation()}>
      <span className={styles.selectionHint}>Drag to place a creator tag · Esc to cancel</span>
      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setSelecting(false); }}>Cancel</button>
      {box ? <div className={styles.box} style={boxStyle(box)} /> : null}
    </div> : null}
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal container={typeof document !== "undefined" ? document.fullscreenElement as HTMLElement | null : undefined}>
        <Dialog.Overlay className={styles.backdrop} />
        <Dialog.Content className={styles.dialog} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <Dialog.Title className={styles.heading}>Find a creator</Dialog.Title>
          <Dialog.Description className={styles.description}>{loaded ? "Search verified names and social profiles." : "Creator tags are included with CORE Membership."}</Dialog.Description>
          <Dialog.Close className={styles.close} aria-label="Close creator search"><X size={20} /></Dialog.Close>
          {loaded ? <>
          <label className={styles.label}>Name or username<input value={query} onChange={(event) => { setQuery(event.target.value); setMessage(""); }} placeholder="e.g. @adinross" maxLength={1000} /></label>
          <div className={styles.actions}>
            <button type="button" disabled={(selectedTime ?? time) == null} onClick={select}><ScanText size={16} /> Place a tag in video</button>
          </div>
          {message ? <p role="status" className={styles.notice}>{message}</p> : null}
          {!query && matches.length ? <p className={styles.description}>From the title or description. These mentions do not confirm who is on screen.</p> : null}
          <div className={styles.results}>
            {matches.map((creator) => <article key={creator.id}><div className={styles.resultIdentity}><CreatorAvatar creator={creator} /><strong>{creator.name}</strong></div><SocialLinks creator={creator} /><button type="button" disabled={busy || (selectedTime ?? time) == null} onClick={() => void suggest(creator)}>{(selectedTime ?? time) == null ? "Open replay for timed tags" : `Suggest tag at ${stamp(selectedTime ?? time ?? 0)}`}</button></article>)}
            {!matches.length ? <p className={styles.description}>{query ? "No verified match yet. Try a full name or username." : tags.length ? "Search the creator directory to find verified social links." : "No reviewed tags at this moment. Search by name or suggest a tag."}</p> : null}
          </div>
          <label className={styles.toggle}><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /> Show verified video tags</label>
          </> : <a className={styles.membership} href={subscription.featureHref("player.creator_tags")} onClick={() => setOpen(false)}>{subscription.signedIn ? "View CORE Membership" : "Sign in to continue"} <ExternalLink size={15} aria-hidden /></a>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
