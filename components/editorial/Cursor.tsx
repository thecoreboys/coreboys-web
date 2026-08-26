"use client";

import { useEffect, useRef, useState } from "react";

type CursorMode = "default" | "action" | "play" | "pause" | "scrub" | "drag" | "hand" | "close" | "grid" | "queue" | "rewind" | "text" | "disabled";
type CursorCommunity = "core" | "flock" | "stable" | "thugs" | "m3" | "nms" | "slg";

const INTERACTIVE_SELECTOR = "a, button, summary, [role='button'], [role='switch'], [role='tab'], [role='menuitem'], [data-cursor='hover'], [data-cursor='action']";
// Only advertise scrubbing where the browser can actually seek. Decorative
// progress indicators on cards must remain playback affordances, not fake
// sliders that imply a drag will work.
const SCRUB_SELECTOR = "input[type='range'], [role='slider'], [data-cursor='scrub']";
const MEDIA_SELECTOR = ".watch-poster:not(.is-photo), .watch-preview-media, .watch-billboard, .watch-player-media";
const NETWORK_SELECTOR = ".watch-home-promo-card, [href^='/channels/'], [href^='/watch/network/']";
const PRIMARY_SELECTOR = ".btn-primary, .watch-billboard-play, [data-cursor='primary']";

const COMMUNITY_ACCENTS: Record<CursorCommunity, string> = {
  core: "#db0368",
  flock: "#ef9244",
  stable: "#53b5f4",
  thugs: "#f05038",
  m3: "#f1f1f4",
  nms: "#f6d330",
  slg: "#e6ab51",
};

const COMMUNITY_ALIASES: Record<string, CursorCommunity> = {
  core: "core",
  house: "core",
  adapt: "flock",
  flock: "flock",
  ron: "stable",
  stable: "stable",
  stableronaldo: "stable",
  lacy: "thugs",
  thugs: "thugs",
  marlon: "m3",
  m3: "m3",
  jason: "nms",
  jasontheween: "nms",
  nms: "nms",
  silky: "slg",
  slg: "slg",
};

function communityFrom(source: HTMLElement | null): CursorCommunity {
  const root = document.documentElement;
  const explicit = source?.closest<HTMLElement>("[data-cursor-community]")?.dataset.cursorCommunity;
  const href = source?.closest<HTMLAnchorElement>("a[href]")?.getAttribute("href") ?? "";
  const routeCommunity = href.match(/\/channels\/([^/?#]+)/)?.[1];
  const selected = root.dataset.cursorTheme ?? "station";
  const candidate = selected === "station"
    ? explicit ?? routeCommunity ?? root.dataset.cursorCommunity ?? "core"
    : selected;
  return COMMUNITY_ALIASES[candidate.toLowerCase()] ?? "core";
}

function readAccent(source: HTMLElement | null): string {
  const root = document.documentElement;
  const theme = root.dataset.cursorTheme ?? "station";
  const selectedThemeColor = getComputedStyle(root).getPropertyValue("--core-cursor-color").trim();
  if (theme !== "station" && selectedThemeColor) return selectedThemeColor;
  const community = communityFrom(source);
  if (community !== "core") return COMMUNITY_ACCENTS[community];
  if (!source) return selectedThemeColor || "#f8f8fa";
  const style = getComputedStyle(source);
  return source.dataset.accent
    || style.getPropertyValue("--channel-accent").trim()
    || style.getPropertyValue("--cursor-accent").trim()
    || selectedThemeColor
    || "#f8f8fa";
}

/**
 * A precise, agent-style pointer for fine-pointer devices. It deliberately
 * yields to text inputs, disabled controls, touch, and reduced-motion users.
 * The overlay never participates in hit testing, so native browser behavior
 * remains intact.
 */
export function Cursor() {
  const pointerRef = useRef<HTMLDivElement>(null);
  const auraRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLDivElement>(null);
  const stationFlashRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reducedMotion.matches) return;

    setEnabled(true);
    document.body.dataset.cursor = "agentic";

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let pointerX = x;
    let pointerY = y;
    let auraX = x;
    let auraY = y;
    let trailX = x;
    let trailY = y;
    let mode: CursorMode = "default";
    let dragDirection = 1;
    let pressed = false;
    let visible = false;
    let accent = "#f8f8fa";
    let community: CursorCommunity = "core";
    let liveTarget = false;
    let magneticTarget: HTMLElement | null = null;
    let reactiveTarget: HTMLElement | null = null;
    let spotlightTarget: HTMLElement | null = null;
    let idleTimer: number | null = null;
    let rippleTimer: number | null = null;
    let flashTimer: number | null = null;
    let scrollTimer: number | null = null;
    let rapidClickTimer: number | null = null;
    let previousClickAt = 0;
    let rapidClicks = 0;
    let hintTimer: number | null = null;
    let hintTypeTimer: number | null = null;
    let hintExitTimer: number | null = null;
    let hintText = "";
    let hintSource: Element | null = null;
    let frame = 0;

    const setIdle = (idle: boolean) => {
      document.body.dataset.cursorIdle = idle ? "true" : "false";
    };

    const scheduleIdle = () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      setIdle(false);
      idleTimer = window.setTimeout(() => setIdle(true), 520);
    };

    const setMode = (next: CursorMode, source: HTMLElement | null) => {
      mode = next;
      community = communityFrom(source);
      accent = readAccent(source);
      document.body.dataset.cursorMode = next;
      document.body.dataset.cursorCommunity = community;
    };

    const setReactiveTarget = (next: HTMLElement | null) => {
      if (reactiveTarget && reactiveTarget !== next) {
        delete reactiveTarget.dataset.cursorReactive;
        delete reactiveTarget.dataset.cursorPressed;
        reactiveTarget.style.removeProperty("--cursor-reactive-accent");
      }
      reactiveTarget = next;
      if (!next) return;
      next.dataset.cursorReactive = "true";
      next.style.setProperty("--cursor-reactive-accent", accent);
    };

    const dismissHint = (immediate = false) => {
      const hint = hintRef.current;
      if (hintTypeTimer !== null) window.clearInterval(hintTypeTimer);
      hintTypeTimer = null;
      if (hintExitTimer !== null) window.clearTimeout(hintExitTimer);
      hintExitTimer = null;
      if (!hint) return;
      if (immediate || !hint.textContent) {
        hint.textContent = "";
        delete hint.dataset.active;
        delete hint.dataset.state;
        delete hint.dataset.typing;
        return;
      }
      delete hint.dataset.active;
      delete hint.dataset.typing;
      hint.dataset.state = "exit";
      hintExitTimer = window.setTimeout(() => {
        if (!hintRef.current) return;
        hintRef.current.textContent = "";
        delete hintRef.current.dataset.state;
      }, 230);
    };

    const clearHint = (immediate = false) => {
      if (hintTimer !== null) window.clearTimeout(hintTimer);
      hintTimer = null;
      hintText = "";
      hintSource = null;
      dismissHint(immediate);
    };

    const scheduleHint = (next: string, source: Element | null) => {
      if (!next || !source || document.documentElement.dataset.cursorScrolling === "true" || document.documentElement.dataset.cursorHints === "off") {
        clearHint();
        return;
      }
      if (hintTimer !== null) window.clearTimeout(hintTimer);
      dismissHint();
      hintText = next;
      hintSource = source;
      hintTimer = window.setTimeout(() => {
        if (!hintRef.current || hintSource !== source || !hintText || (source instanceof HTMLElement && source.hasAttribute("aria-describedby"))) return;
        const hint = hintRef.current;
        if (hintExitTimer !== null) window.clearTimeout(hintExitTimer);
        hintExitTimer = null;
        hint.textContent = "";
        hint.dataset.state = "enter";
        hint.dataset.active = "true";
        hint.dataset.typing = "true";
        let index = 0;
        const value = hintText;
        const interval = value.length > 28 ? 11 : 15;
        hintTypeTimer = window.setInterval(() => {
          if (!hintRef.current || hintSource !== source || index >= value.length) {
            if (hintTypeTimer !== null) window.clearInterval(hintTypeTimer);
            hintTypeTimer = null;
            if (hintRef.current) delete hintRef.current.dataset.typing;
            return;
          }
          index += 1;
          hintRef.current.textContent = value.slice(0, index);
        }, interval);
      }, 620);
    };

    const hintFor = (nextMode: CursorMode, action: HTMLElement | null, isLive: boolean) => {
      if (nextMode === "play") return isLive ? "Click to watch live" : "Click to play";
      if (nextMode === "pause") return "Click to pause";
      if (nextMode === "scrub") return isLive ? "Drag to seek" : "Drag to scrub";
      if (nextMode === "drag") return "Drag to browse";
      if (nextMode === "hand") return "Release to browse";
      if (nextMode === "close") {
        const closeLabel = (action?.getAttribute("aria-label") || action?.getAttribute("title") || "Close").trim().slice(0, 36);
        return /^close/i.test(closeLabel) ? closeLabel : "Close";
      }
      if (nextMode === "grid") return "Choose layout";
      if (nextMode === "queue") return "Add to My List";
      if (nextMode === "rewind") return "Rewind";
      if (nextMode !== "action" || !action) return "";
      const custom = action.closest<HTMLElement>("[data-cursor-hint]")?.dataset.cursorHint;
      if (custom) return custom;
      const rawLabel = (action.getAttribute("aria-label") || action.getAttribute("title") || action.innerText || action.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      const label = rawLabel.slice(0, 36);
      if (!label) return "Click to open";
      if (/^play now\b/i.test(label)) return "";
      // Live cards often expose their whole visual label to assistive tech
      // (LIVE, viewer count, action, network). The pointer hint only needs
      // the action, so collapse that noise into one clear sentence.
      const liveDestination = rawLabel.match(/watch live\s+(.+)$/i)?.[1]?.replace(/\s+network$/i, "").trim();
      if (liveDestination) return `Watch ${liveDestination} live`;
      if (/^live\b.*\b(open|show) (picker|live)/i.test(rawLabel)) return "Browse live channels";
      if (/^open\s+live\b/i.test(rawLabel)) return "Browse live channels";
      const context = action.closest<HTMLElement>("[data-cursor-context]")?.dataset.cursorContext
        || action.closest("fieldset")?.querySelector("legend")?.textContent?.trim()
        || action.closest("[role='tablist'], [role='group']")?.getAttribute("aria-label")
        || "";
      if (action.tagName === "SUMMARY") {
        const open = action.parentElement?.hasAttribute("open");
        return `${open ? "Hide" : "Show"} ${label}`;
      }
      if (action.hasAttribute("aria-expanded")) {
        const base = label.replace(/^(open|close|show|hide)\s+/i, "");
        return `${action.getAttribute("aria-expanded") === "true" ? "Hide" : "Show"} ${base}`;
      }
      if (action.getAttribute("role") === "switch" || action.hasAttribute("aria-checked")) {
        return `${action.getAttribute("aria-checked") === "true" ? "Turn off" : "Turn on"} ${label}`;
      }
      if (action.getAttribute("aria-pressed") !== null) {
        if (context) return `Use ${label} for ${context}`;
        if (action.getAttribute("role") === "tab" || action.closest("[role='tablist']")) return `Switch to ${label}`;
        if (/^(enable|disable|show|hide|mute|unmute|add|remove|save|unsave)/i.test(label)) return label;
        if (/(captions|audio|sound|autoplay|ambient|data saver|preview|filters|fullscreen|streams|locked)/i.test(label)) {
          return `${action.getAttribute("aria-pressed") === "true" ? "Turn off" : "Turn on"} ${label}`;
        }
        return `Choose ${label}`;
      }
      if (/become .*member|supporter member/i.test(label)) return "Explore member benefits";
      if (/sign in|log in/i.test(label)) return "Sign in to continue";
      if (/scroll this row left/i.test(label)) return "Browse left";
      if (/scroll this row right/i.test(label)) return "Browse right";
      if (/open .* community/i.test(label)) return label.replace(/^open\s+/i, "Visit ");
      if (action.tagName === "A") return label.toLowerCase().startsWith("open ") ? label : `Open ${label}`;
      return label;
    };

    const playCommunityClick = () => {
      if (document.documentElement.dataset.cursorSound !== "on") return;
      try {
        const AudioContextConstructor = window.AudioContext
          ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextConstructor) return;
        const context = new AudioContextConstructor();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const frequency = { core: 660, flock: 440, stable: 760, thugs: 320, m3: 520, nms: 880, slg: 610 }[community];
        oscillator.type = community === "thugs" ? "sawtooth" : community === "m3" ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.14, context.currentTime + 0.055);
        gain.gain.setValueAtTime(0.018, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.1);
        oscillator.addEventListener("ended", () => void context.close());
      } catch {
        // Browser audio is an optional enhancement, not an interaction requirement.
      }
    };

    const setSpotlight = (element: HTMLElement | null, clientX: number, clientY: number) => {
      if (spotlightTarget && spotlightTarget !== element) {
        delete spotlightTarget.dataset.cursorSpotlight;
        spotlightTarget.style.removeProperty("--cursor-x");
        spotlightTarget.style.removeProperty("--cursor-y");
      }
      spotlightTarget = element;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      element.dataset.cursorSpotlight = "true";
      element.style.setProperty("--cursor-x", `${((clientX - rect.left) / rect.width) * 100}%`);
      element.style.setProperty("--cursor-y", `${((clientY - rect.top) / rect.height) * 100}%`);
    };

    const inspectTarget = (target: EventTarget | null, clientX: number, clientY: number) => {
      const element = target instanceof Element ? target : null;
      const editable = element?.closest("textarea, select, [contenteditable='true'], input:not([type='range'])");
      if (editable) {
        visible = false;
        magneticTarget = null;
        setReactiveTarget(null);
        setSpotlight(null, clientX, clientY);
        setMode("text", null);
        clearHint();
        return;
      }

      const disabled = element?.closest("button:disabled, [aria-disabled='true'], input:disabled");
      if (disabled) {
        visible = false;
        magneticTarget = null;
        setReactiveTarget(null);
        setSpotlight(null, clientX, clientY);
        setMode("disabled", null);
        clearHint();
        return;
      }

      visible = true;
      const scrubber = element?.closest(SCRUB_SELECTOR) as HTMLElement | null;
      const media = element?.closest(MEDIA_SELECTOR) as HTMLElement | null;
      const action = element?.closest(INTERACTIVE_SELECTOR) as HTMLElement | null;
      const dragRail = element?.closest("[data-drag-scroll-root='true']") as HTMLElement | null;
      const isCardAction = action && !action.matches(".watch-poster-link, .watch-preview-media-link, .watch-billboard-surface-action");
      const isPlaying = Boolean(media?.querySelector("[aria-label^='Pause'], [aria-label='Pause video']"));
      const actionLabel = action?.getAttribute("aria-label")?.toLowerCase() ?? "";
      const isClose = Boolean(action && (actionLabel.startsWith("close") || actionLabel.startsWith("dismiss") || action.textContent?.trim() === "×"));
      const isGrid = Boolean(action?.closest("[data-cursor='grid'], .watch-player-layout, .multiview-layout"));
      const isQueue = Boolean(action?.closest("[data-cursor='queue'], .watch-billboard-list, .watch-poster-save"));
      const isRewind = Boolean(action && /rewind|back\s*(10|15|30)|previous/.test(actionLabel));
      liveTarget = Boolean(element?.closest(".is-live, [data-live='true'], [data-cursor-live='true']"));
      const source = scrubber ?? (isCardAction ? action : null) ?? media ?? dragRail ?? action;
      let nextMode: CursorMode = "default";
      if (scrubber) nextMode = "scrub";
      else if (isClose) nextMode = "close";
      else if (isGrid) nextMode = "grid";
      else if (isQueue) nextMode = "queue";
      else if (isRewind) nextMode = "rewind";
      else if (dragRail?.classList.contains("is-dragging")) nextMode = "hand";
      else if (isCardAction) nextMode = "action";
      else if (media) nextMode = isPlaying ? "pause" : "play";
      // A rail becomes a hand only after its normal pointer gesture has
      // crossed the drag threshold. Before that it should not compete with
      // the card/play action under the pointer.
      else if (dragRail) nextMode = "default";
      else if (action) nextMode = "action";
      setMode(nextMode, source);
      scheduleHint(hintFor(nextMode, action, liveTarget), source);
      magneticTarget = action && action.matches(PRIMARY_SELECTOR) ? action : action;
      setReactiveTarget(action);
      const spotlight = element?.closest(".watch-poster, .watch-home-promo-card") as HTMLElement | null;
      setSpotlight(spotlight, clientX, clientY);
    };

    const triggerRipple = (event: PointerEvent) => {
      const ripple = rippleRef.current;
      if (!ripple) return;
      ripple.style.setProperty("--cursor-accent", accent);
      ripple.dataset.community = community;
      ripple.style.transform = `translate3d(${event.clientX - 20}px, ${event.clientY - 20}px, 0)`;
      ripple.dataset.active = "true";
      if (rippleTimer !== null) window.clearTimeout(rippleTimer);
      rippleTimer = window.setTimeout(() => delete ripple.dataset.active, 420);
    };

    const triggerStationFlash = (target: EventTarget | null) => {
      const network = target instanceof Element ? target.closest(NETWORK_SELECTOR) : null;
      if (!network || !stationFlashRef.current) return;
      const flash = stationFlashRef.current;
      flash.style.setProperty("--cursor-accent", readAccent(network as HTMLElement));
      flash.dataset.community = communityFrom(network as HTMLElement);
      flash.dataset.active = "true";
      if (flashTimer !== null) window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => delete flash.dataset.active, 520);
    };

    const onMove = (event: PointerEvent) => {
      const deltaX = event.clientX - x;
      if (Math.abs(deltaX) > 1) dragDirection = deltaX > 0 ? 1 : -1;
      x = event.clientX;
      y = event.clientY;
      inspectTarget(event.target, x, y);
      scheduleIdle();
    };
    const onDown = (event: PointerEvent) => {
      pressed = true;
      clearHint();
      const action = (event.target as Element | null)?.closest(INTERACTIVE_SELECTOR) as HTMLElement | null;
      if (action) {
        setReactiveTarget(action);
        action.dataset.cursorPressed = "true";
      }
      if ((event.target as Element | null)?.closest(INTERACTIVE_SELECTOR)) {
        const now = performance.now();
        rapidClicks = now - previousClickAt < 360 ? rapidClicks + 1 : 1;
        previousClickAt = now;
        document.documentElement.dataset.cursorRapid = rapidClicks > 2 ? "true" : "false";
        if (rapidClickTimer !== null) window.clearTimeout(rapidClickTimer);
        rapidClickTimer = window.setTimeout(() => {
          rapidClicks = 0;
          delete document.documentElement.dataset.cursorRapid;
        }, 460);
        triggerRipple(event);
        triggerStationFlash(event.target);
        playCommunityClick();
      }
    };
    const onUp = () => {
      pressed = false;
      if (reactiveTarget) delete reactiveTarget.dataset.cursorPressed;
    };
    const onWindowLeave = () => {
      visible = false;
      setSpotlight(null, x, y);
      setReactiveTarget(null);
      clearHint();
    };
    const onScroll = () => {
      clearHint();
      document.documentElement.dataset.cursorScrolling = "true";
      if (scrollTimer !== null) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => delete document.documentElement.dataset.cursorScrolling, 150);
    };

    const tick = () => {
      let targetX = x;
      let targetY = y;
      if (magneticTarget) {
        const rect = magneticTarget.getBoundingClientRect();
        const force = magneticTarget.matches(PRIMARY_SELECTOR) ? 0.16 : 0.055;
        targetX += Math.max(-54, Math.min(54, rect.left + rect.width / 2 - x)) * force;
        targetY += Math.max(-36, Math.min(36, rect.top + rect.height / 2 - y)) * force;
      }
      pointerX += (targetX - pointerX) * 0.34;
      pointerY += (targetY - pointerY) * 0.34;
      auraX += (targetX - auraX) * 0.16;
      auraY += (targetY - auraY) * 0.16;
      trailX += (targetX - trailX) * 0.075;
      trailY += (targetY - trailY) * 0.075;
      const pointer = pointerRef.current;
      const aura = auraRef.current;
      const trail = trailRef.current;
      const particles = particlesRef.current;
      const hint = hintRef.current;
      const sizeFactor = document.documentElement.dataset.cursorSize === "large" ? 1.28 : 1;
      const scale = (mode === "action" ? 1.12 : mode === "scrub" ? 0.92 : mode === "drag" ? 0.96 : mode === "play" || mode === "pause" ? 1.06 : 1) * (pressed ? 0.88 : 1) * sizeFactor;
      const rotation = mode === "action" ? -4 : mode === "scrub" ? 90 : mode === "drag" ? -18 * dragDirection : 0;

      for (const element of [pointer, aura, trail]) {
        if (!element) continue;
        element.dataset.mode = mode;
        element.dataset.live = liveTarget ? "true" : "false";
        element.dataset.community = community;
        element.style.opacity = visible ? "1" : "0";
        element.style.setProperty("--cursor-accent", accent);
      }
      if (pointer) pointer.style.transform = `translate3d(${pointerX - 3}px, ${pointerY - 2}px, 0) rotate(${rotation}deg) scale(${scale})`;
      if (aura) aura.style.transform = `translate3d(${auraX - 18}px, ${auraY - 18}px, 0) scale(${(mode === "action" ? 1.25 : mode === "scrub" ? 0.8 : 1) * sizeFactor})`;
      if (trail) trail.style.transform = `translate3d(${trailX - 12}px, ${trailY - 12}px, 0) rotate(${rotation}deg)`;
      if (particles) {
        particles.dataset.mode = mode;
        particles.dataset.community = community;
        particles.dataset.live = liveTarget ? "true" : "false";
        particles.style.opacity = visible && ["flock", "thugs", "nms", "slg"].includes(community) ? "1" : "0";
        particles.style.setProperty("--cursor-accent", accent);
        particles.style.transform = `translate3d(${trailX - 21}px, ${trailY - 21}px, 0) rotate(${rotation}deg)`;
      }
      if (hint) {
        hint.dataset.community = community;
        hint.style.setProperty("--cursor-accent", accent);
        const safeInset = 12;
        const hintWidth = hint.offsetWidth || 132;
        const hintHeight = hint.offsetHeight || 28;
        const hintX = Math.max(safeInset, Math.min(pointerX + 22, window.innerWidth - hintWidth - safeInset));
        const hintY = pointerY + 20 + hintHeight > window.innerHeight - safeInset
          ? Math.max(safeInset, pointerY - hintHeight - 18)
          : pointerY + 20;
        hint.style.transform = `translate3d(${hintX}px, ${hintY}px, 0)`;
      }
      frame = window.requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    window.addEventListener("blur", onWindowLeave);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("mouseleave", onWindowLeave);
    scheduleIdle();
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onWindowLeave);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("mouseleave", onWindowLeave);
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      if (rippleTimer !== null) window.clearTimeout(rippleTimer);
      if (flashTimer !== null) window.clearTimeout(flashTimer);
      if (scrollTimer !== null) window.clearTimeout(scrollTimer);
      if (rapidClickTimer !== null) window.clearTimeout(rapidClickTimer);
      clearHint(true);
      if (spotlightTarget) delete spotlightTarget.dataset.cursorSpotlight;
      setReactiveTarget(null);
      window.cancelAnimationFrame(frame);
      delete document.body.dataset.cursor;
      delete document.body.dataset.cursorMode;
      delete document.body.dataset.cursorIdle;
      delete document.body.dataset.cursorCommunity;
      delete document.documentElement.dataset.cursorScrolling;
      delete document.documentElement.dataset.cursorRapid;
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <div ref={trailRef} aria-hidden className="core-agent-cursor-trail" />
      <span ref={particlesRef} aria-hidden className="core-agent-cursor-particles"><i /><i /><i /></span>
      <div ref={auraRef} aria-hidden className="core-agent-cursor-aura" />
      <div ref={rippleRef} aria-hidden className="core-agent-cursor-ripple" />
      <div ref={stationFlashRef} aria-hidden className="core-agent-cursor-station-flash" />
      <div ref={hintRef} aria-hidden className="core-agent-cursor-hint" />
      <div ref={pointerRef} aria-hidden className="core-agent-cursor">
        <svg viewBox="0 0 32 38" focusable="false">
          <defs>
            <linearGradient id="cursor-chrome" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.48" stopColor="#a8a8ae" />
              <stop offset="1" stopColor="#ffffff" />
            </linearGradient>
          </defs>
          <path d="M3 2.5 5.3 31.2l7.4-8.1 6.1 12.3 5.7-3-6.2-12.1 10.5-2.2Z" />
        </svg>
        <span className="core-agent-cursor-mark" />
      </div>
    </>
  );
}
