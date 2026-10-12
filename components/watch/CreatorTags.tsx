"use client";
/* eslint-disable @next/next/no-img-element -- Crops are temporary browser data URLs, not remote catalog images. */

import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, ScanText, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { activeCreatorTags, matchCreatorText, normalizeCreatorText, videoRectangle, type CreatorBox, type CreatorProfile, type CreatorTagPayload } from "@/lib/creator-tags/model";
import styles from "./CreatorTags.module.css";

const empty: CreatorTagPayload = { creators: [], tags: [], mentions: [] };
const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
function SocialLinks({ creator }: { creator: CreatorProfile }) {
  return <div className={styles.socials}>{creator.socials.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>
    {link.platform === "x" ? "X" : link.platform.charAt(0).toUpperCase() + link.platform.slice(1)} <ExternalLink size={12} aria-hidden />
  </a>)}</div>;
}

export function CreatorTags({ assetKey, title, getTime, mediaRef, fit = "contain", sourceRatio = 16 / 9, compact = false, liveStartedAt }: {
  assetKey: string; title: string; getTime: () => number | null; mediaRef?: RefObject<HTMLVideoElement | null>;
  fit?: "contain" | "cover"; sourceRatio?: number; compact?: boolean; liveStartedAt?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const reader = useRef(getTime); reader.current = getTime;
  const [data, setData] = useState<CreatorTagPayload>(empty);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [box, setBox] = useState<CreatorBox | null>(null);
  const anchor = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const [time, setTime] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [crop, setCrop] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [geometry, setGeometry] = useState({ x: 0, y: 0, width: 1, height: 1 });
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const sequence = useRef(0);
  const searchSequence = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setData(empty); setLoaded(false); setOpen(false); setSelecting(false); setBox(null); setCrop(null); setQuery(""); setMessage(""); setExpandedTag(null);
    sequence.current++;
    searchSequence.current++;
    const host = root.current?.parentElement;
    const activate = () => setLoaded(true);
    host?.addEventListener("pointerenter", activate, { once: true });
    host?.addEventListener("focusin", activate, { once: true });
    return () => { host?.removeEventListener("pointerenter", activate); host?.removeEventListener("focusin", activate); };
  }, [assetKey]);

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
        const response = await fetch(`/api/watch/creator-tags?${params}`, { signal: controller.signal });
        const value = await response.json();
        if (response.ok && Array.isArray(value.creators) && Array.isArray(value.tags) && currentSequence === sequence.current) setData(value);
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
      setGeometry(videoRectangle({ width: host.clientWidth, height: host.clientHeight },
        { width: video?.videoWidth || sourceRatio, height: video?.videoHeight || 1 }, fit));
    };
    update(); const observer = new ResizeObserver(update); observer.observe(host);
    mediaRef?.current?.addEventListener("loadedmetadata", update);
    return () => { observer.disconnect(); mediaRef?.current?.removeEventListener("loadedmetadata", update); };
  }, [assetKey, mediaRef, fit, sourceRatio]);

  const named = matchCreatorText(title, data.creators);
  const textMatches = matchCreatorText(query, data.creators);
  const normalizedQuery = normalizeCreatorText(query);
  const matches = normalizedQuery ? data.creators.filter((creator) => creator.active && (textMatches.some((entry) => entry.id === creator.id) || [creator.name, ...creator.aliases].some((alias) => normalizeCreatorText(alias).includes(normalizedQuery)))).slice(0, 12)
    : [...new Map([...named, ...data.mentions.map((entry) => data.creators.find((creator) => creator.id === entry.creatorId)).filter((creator): creator is CreatorProfile => Boolean(creator))].map((creator) => [creator.id, creator])).values()];
  const tags = visible ? activeCreatorTags(data.tags, time) : [];

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
    setSelectedTime(reader.current()); setCrop(null); setMessage(""); setBox(null);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!anchor.current || anchor.current.pointerId !== event.pointerId) return;
    const end = point(event), start = anchor.current;
    setBox({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) });
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!anchor.current || anchor.current.pointerId !== event.pointerId) return;
    event.stopPropagation(); anchor.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!box || box.width < .005 || box.height < .005) { setBox(null); return; }
    const video = mediaRef?.current;
    if (video?.videoWidth && video.videoHeight) {
      try {
        const canvas = document.createElement("canvas");
        const width = video.videoWidth * box.width, height = video.videoHeight * box.height;
        const scale = Math.min(1, 1280 / width, 720 / height);
        canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
        canvas.getContext("2d")!.drawImage(video, video.videoWidth * box.x, video.videoHeight * box.y, width, height, 0, 0, canvas.width, canvas.height);
        setCrop(canvas.toDataURL("image/jpeg", .8));
      } catch { setMessage("This player cannot provide a frame. Upload a screenshot containing visible text, or enter the name or username."); }
    } else setMessage("This embed cannot provide a frame. Upload a screenshot containing visible text, or enter the name or username.");
    setSelecting(false); setOpen(true);
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 8_000_000) { setMessage("Choose a PNG, JPEG or WebP screenshot under 8 MB."); return; }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1280 / bitmap.width, 720 / bitmap.height);
      const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      setCrop(canvas.toDataURL("image/jpeg", .8)); setMessage("Screenshot ready. Read the visible text to search the directory.");
    } catch { setMessage("That image could not be opened."); }
  }
  async function readText() {
    if (!crop) return;
    setBusy(true); setMessage("");
    const request = ++searchSequence.current;
    try {
      const response = await fetch("/api/watch/creator-tags/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: crop }) });
      const value = await response.json();
      if (request !== searchSequence.current) return;
      if (!response.ok) throw new Error(value.error || "Text search could not complete.");
      setQuery(value.text || "");
      setMessage(value.text ? `Read: ${value.text}` : "No readable name or username found. Enter the visible text yourself.");
    } catch (error) { if (request === searchSequence.current) setMessage(error instanceof Error ? error.message : "Text search could not complete."); }
    finally { setBusy(false); }
  }
  async function suggest(creator: CreatorProfile) {
    const at = selectedTime ?? time;
    if (at == null) { setMessage("Open a replay to suggest a timed creator tag. Profile lookup remains available during live streams."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/watch/creator-tags/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetKey, creatorId: creator.id,
        startSeconds: Math.floor(at), endSeconds: Math.floor(at) + 5, box, liveStartedAt, evidenceKind: "visible-text", evidence: query || `Viewer selected ${creator.name} at ${stamp(at)}` }) });
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
  return <div ref={root} className={styles.overlay} data-creator-tags data-cursor-native onKeyDown={(event) => { if (event.key === "Escape") { setSelecting(false); setExpandedTag(null); } }}>
    <div className={styles.toolbar}>
      <button type="button" aria-label="Open creator tags and social links" aria-expanded={open} onClick={(event) => { event.stopPropagation(); setLoaded(true); setSelectedTime(reader.current()); setOpen(true); }}><Users size={15} aria-hidden />{compact ? null : "Creators"}</button>
      {tags.length ? <button type="button" aria-label="Hide creator tags" onClick={() => setVisible(false)}><X size={14} /></button> : null}
    </div>
    {tags.map((tag, index) => {
      const creator = data.creators.find((entry) => entry.id === tag.creatorId);
      if (!creator) return null;
      const style = tag.box ? { left: `${Math.max(5, Math.min(85, (geometry.x + (tag.box.x + tag.box.width / 2) * geometry.width) * 100))}%`, top: `${Math.max(8, Math.min(78, (geometry.y + tag.box.y * geometry.height) * 100))}%` } : { left: "3%", top: `${20 + index * 10}%` };
      return <div key={tag.id} className={styles.tag} style={style}>
        <button type="button" aria-expanded={expandedTag === tag.id} onClick={(event) => { event.stopPropagation(); setExpandedTag(expandedTag === tag.id ? null : tag.id); }}>{creator.name}</button>
        <div className={styles.tooltip} data-expanded={expandedTag === tag.id ? "true" : undefined}><strong>{creator.name}</strong><SocialLinks creator={creator} /></div>
      </div>;
    })}
    {selecting ? <div className={styles.selection} role="region" aria-label="Drag over a visible name or watermark" onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { anchor.current = null; setBox(null); }} onClick={(event) => event.stopPropagation()}>
      <span className={styles.selectionHint}>Drag over a name or watermark · Esc to cancel</span>
      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setSelecting(false); }}>Cancel</button>
      {box ? <div className={styles.box} style={boxStyle(box)} /> : null}
    </div> : null}
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal container={typeof document !== "undefined" ? document.fullscreenElement as HTMLElement | null : undefined}>
        <Dialog.Overlay className={styles.backdrop} />
        <Dialog.Content className={styles.dialog} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <Dialog.Title className={styles.heading}>Creators & socials</Dialog.Title>
          <Dialog.Description className={styles.description}>Find a creator by their visible name, username, or a verified video tag.</Dialog.Description>
          <Dialog.Close className={styles.close} aria-label="Close creator search"><X size={20} /></Dialog.Close>
          <label className={styles.label}>Name or username<input value={query} onChange={(event) => { setQuery(event.target.value); setMessage(""); }} placeholder="e.g. @adinross" maxLength={1000} /></label>
          <div className={styles.actions}>
            <button type="button" onClick={() => { setOpen(false); setSelecting(true); setBox(null); setCrop(null); }}><ScanText size={16} /> Select text in video</button>
            <button type="button" onClick={() => fileRef.current?.click()}>Upload screenshot</button>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
          {crop ? <div className={styles.crop}><img src={crop} alt="Selected text to read" /><button type="button" disabled={busy} onClick={() => void readText()}>{busy ? "Reading…" : "Read visible text"}</button></div> : null}
          {message ? <p role="status" className={styles.notice}>{message}</p> : null}
          {!query && matches.length ? <p className={styles.description}>Names mentioned in this video’s metadata. A mention does not confirm who is on screen.</p> : null}
          <div className={styles.results}>
            {matches.map((creator) => <article key={creator.id}><strong>{creator.name}</strong><SocialLinks creator={creator} /><button type="button" disabled={busy || (selectedTime ?? time) == null} onClick={() => void suggest(creator)}>{(selectedTime ?? time) == null ? "Open replay for timed tags" : `Suggest tag at ${stamp(selectedTime ?? time ?? 0)}`}</button></article>)}
            {!matches.length ? <p className={styles.description}>{query ? "No verified match yet. Try a full name or username." : "Search the creator directory to find verified social links."}</p> : null}
          </div>
          <label className={styles.toggle}><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /> Show verified video tags</label>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
