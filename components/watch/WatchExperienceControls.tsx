"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Accessibility, Check, Maximize2, RotateCcw, Settings2, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { usePlayerOptional } from "@/components/providers/PlayerProvider";
import { WatchSelect } from "@/components/watch/WatchSelect";

type MotionMode = "calm" | "standard" | "cinematic";
type DensityMode = "compact" | "balanced" | "theater";
type StationTheme = "auto" | "core" | "stable" | "flock" | "thugs" | "m3" | "nms" | "slg";
type CursorTheme = "station" | "mono" | "gold" | "core" | "flock" | "stable" | "thugs" | "m3" | "nms" | "slg";
type CursorFx = "signature" | "quiet";
type CursorSize = "standard" | "large";
type CursorHints = "smart" | "off";
type ContrastMode = "standard" | "high" | "oled";
type TextSize = "standard" | "large";
type ReducedMotion = "system" | "on";
type AutoplayMode = "muted" | "off";
type ExperiencePreset = "recommended" | "cinematic" | "focus" | "quiet" | "accessible" | "custom";

type ExperiencePreferences = {
  motion: MotionMode;
  density: DensityMode;
  ambient: boolean;
  sound: boolean;
  theme: StationTheme;
  cursorTheme: CursorTheme;
  cursorFx: CursorFx;
  cursorSize: CursorSize;
  cursorHints: CursorHints;
  contrast: ContrastMode;
  textSize: TextSize;
  reducedMotion: ReducedMotion;
  autoplay: AutoplayMode;
};

const STORAGE_KEY = "core-watch-experience-v1";
const DEFAULTS: ExperiencePreferences = {
  motion: "cinematic",
  density: "balanced",
  ambient: true,
  sound: false,
  theme: "auto",
  cursorTheme: "station",
  cursorFx: "signature",
  cursorSize: "standard",
  cursorHints: "smart",
  contrast: "standard",
  textSize: "standard",
  reducedMotion: "system",
  autoplay: "muted",
};

const PRESETS: Record<Exclude<ExperiencePreset, "custom">, ExperiencePreferences> = {
  recommended: DEFAULTS,
  cinematic: { ...DEFAULTS, density: "theater", ambient: true, cursorFx: "signature" },
  focus: { ...DEFAULTS, motion: "calm", ambient: false, cursorFx: "quiet", cursorHints: "off" },
  quiet: { ...DEFAULTS, motion: "calm", ambient: false, sound: false, cursorFx: "quiet", autoplay: "off" },
  accessible: { ...DEFAULTS, motion: "calm", contrast: "high", textSize: "large", reducedMotion: "on", cursorSize: "large", autoplay: "off" },
};

const THEME_COLORS: Record<StationTheme, string> = {
  auto: "219, 3, 104",
  core: "219, 3, 104",
  stable: "55, 171, 244",
  flock: "235, 64, 100",
  thugs: "235, 77, 71",
  m3: "191, 191, 191",
  nms: "236, 212, 25",
  slg: "230, 171, 81",
};

const CURSOR_COLORS: Record<CursorTheme, string> = {
  station: "#f8f8fa",
  mono: "#f8f8fa",
  gold: "#f4cb74",
  core: "#db0368",
  flock: "#ef9244",
  stable: "#53b5f4",
  thugs: "#f05038",
  m3: "#f1f1f4",
  nms: "#f6d330",
  slg: "#e6ab51",
};

const MEMBER_THEMES: Record<string, StationTheme> = {
  stableronaldo: "stable",
  adaptt: "flock",
  lacy: "thugs",
  marlon: "m3",
  jasontheween: "nms",
  silky: "slg",
  core: "core",
  house: "core",
};

function readPreferences(): ExperiencePreferences {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<ExperiencePreferences>;
    return {
      motion: saved.motion === "calm" || saved.motion === "standard" || saved.motion === "cinematic" ? saved.motion : DEFAULTS.motion,
      density: saved.density === "compact" || saved.density === "balanced" || saved.density === "theater" ? saved.density : DEFAULTS.density,
      ambient: typeof saved.ambient === "boolean" ? saved.ambient : DEFAULTS.ambient,
      sound: typeof saved.sound === "boolean" ? saved.sound : DEFAULTS.sound,
      theme: saved.theme && saved.theme in THEME_COLORS ? saved.theme : DEFAULTS.theme,
      cursorTheme: saved.cursorTheme && saved.cursorTheme in CURSOR_COLORS ? saved.cursorTheme : DEFAULTS.cursorTheme,
      cursorFx: saved.cursorFx === "quiet" || saved.cursorFx === "signature" ? saved.cursorFx : DEFAULTS.cursorFx,
      cursorSize: saved.cursorSize === "large" || saved.cursorSize === "standard" ? saved.cursorSize : DEFAULTS.cursorSize,
      cursorHints: saved.cursorHints === "off" || saved.cursorHints === "smart" ? saved.cursorHints : DEFAULTS.cursorHints,
      contrast: saved.contrast === "high" || saved.contrast === "oled" || saved.contrast === "standard" ? saved.contrast : DEFAULTS.contrast,
      textSize: saved.textSize === "large" || saved.textSize === "standard" ? saved.textSize : DEFAULTS.textSize,
      reducedMotion: saved.reducedMotion === "on" || saved.reducedMotion === "system" ? saved.reducedMotion : DEFAULTS.reducedMotion,
      autoplay: saved.autoplay === "off" || saved.autoplay === "muted" ? saved.autoplay : DEFAULTS.autoplay,
    };
  } catch {
    return DEFAULTS;
  }
}

export function WatchExperienceControls() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [leanBack, setLeanBack] = useState(false);
  const [preferences, setPreferences] = useState<ExperiencePreferences>(DEFAULTS);
  const [activePreset, setActivePreset] = useState<ExperiencePreset>("recommended");
  const [undoPreferences, setUndoPreferences] = useState<ExperiencePreferences | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closePanel = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => setPreferences(readPreferences()), []);

  // "Autoplay previews" here and in Account settings must be one setting:
  // the hero, hover previews and cards read the player's previewAutoplay.
  // Only a change made in this panel is pushed, so mounting never overrides
  // the account's saved choice.
  const player = usePlayerOptional();
  const setPreviewAutoplay = player?.setPreviewAutoplay;
  const autoplayTouched = useRef(false);
  useEffect(() => {
    if (!autoplayTouched.current) return;
    setPreviewAutoplay?.(preferences.autoplay !== "off");
  }, [preferences.autoplay, setPreviewAutoplay]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.watchMotion = preferences.motion;
    root.dataset.watchDensity = preferences.density;
    root.dataset.watchAmbient = preferences.ambient ? "on" : "off";
    root.dataset.watchTheme = preferences.theme;
    root.dataset.cursorTheme = preferences.cursorTheme;
    root.dataset.cursorFx = preferences.cursorFx;
    root.dataset.cursorSize = preferences.cursorSize;
    root.dataset.cursorHints = preferences.cursorHints;
    root.dataset.cursorSound = preferences.sound ? "on" : "off";
    root.dataset.watchContrast = preferences.contrast;
    root.dataset.watchTextSize = preferences.textSize;
    root.dataset.watchReducedMotion = preferences.reducedMotion;
    root.dataset.watchAutoplay = preferences.autoplay;
    root.style.setProperty("--watch-station-rgb", THEME_COLORS[preferences.theme]);
    root.style.setProperty("--core-cursor-color", CURSOR_COLORS[preferences.cursorTheme]);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Blocked storage only means the choice is not remembered next visit.
    }
  }, [preferences]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.watchLeanback = leanBack ? "on" : "off";
    return () => {
      delete root.dataset.watchLeanback;
    };
  }, [leanBack]);

  useEffect(() => {
    const onAmbient = (event: Event) => {
      const detail = (event as CustomEvent<{ memberSlug?: string | null; title?: string }>).detail;
      const theme = MEMBER_THEMES[detail?.memberSlug?.toLowerCase() ?? ""] ?? "core";
      if (preferences.theme === "auto") {
        document.documentElement.style.setProperty("--watch-station-rgb", THEME_COLORS[theme]);
      }
    };
    window.addEventListener("core:watch-station", onAmbient);
    return () => window.removeEventListener("core:watch-station", onAmbient);
  }, [preferences.theme]);

  useEffect(() => {
    const key = `core-watch-scroll:${pathname}`;
    const saved = Number(window.sessionStorage.getItem(key));
    if (Number.isFinite(saved) && saved > 0) {
      const restore = window.setTimeout(() => window.scrollTo({ top: saved, behavior: "auto" }), 70);
      return () => window.clearTimeout(restore);
    }
    const save = () => window.sessionStorage.setItem(key, String(Math.round(window.scrollY)));
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
    };
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") {
        if (open) {
          event.preventDefault();
          closePanel();
          return;
        }
        setLeanBack(false);
        return;
      }
      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        setLeanBack((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePanel, open]);

  useEffect(() => {
    if (!open) return;
    const focusPanel = window.setTimeout(() => panelRef.current?.focus(), 0);
    const onTabKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
      ));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onTabKey);
    return () => {
      window.clearTimeout(focusPanel);
      window.removeEventListener("keydown", onTabKey);
    };
  }, [open]);

  const playFeedback = (force = false) => {
    if (!force && !preferences.sound) return;
    try {
      const AudioContextConstructor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context = new AudioContextConstructor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.08);
      gain.gain.setValueAtTime(0.024, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.13);
      oscillator.addEventListener("ended", () => void context.close());
    } catch {
      // Sound remains an optional enhancement; browsers may withhold it.
    }
  };
  const update = (patch: Partial<ExperiencePreferences>) => {
    playFeedback();
    autoplayTouched.current = true;
    setUndoPreferences(preferences);
    setPreferences((current) => ({ ...current, ...patch }));
    setActivePreset("custom");
  };
  const applyPreset = (preset: Exclude<ExperiencePreset, "custom">) => {
    playFeedback();
    autoplayTouched.current = true;
    setUndoPreferences(preferences);
    setPreferences(PRESETS[preset]);
    setActivePreset(preset);
    if (preset === "cinematic") setLeanBack(false);
    if (preset === "accessible") setLeanBack(false);
  };
  const restoreDefaults = () => {
    playFeedback();
    autoplayTouched.current = true;
    setUndoPreferences(preferences);
    setPreferences(DEFAULTS);
    setActivePreset("recommended");
    setLeanBack(false);
  };
  const changedSettingCount = useMemo(
    () => (Object.keys(DEFAULTS) as Array<keyof ExperiencePreferences>).filter((key) => preferences[key] !== DEFAULTS[key]).length,
    [preferences],
  );

  return (
    <div className={`watch-experience ${open ? "is-open" : ""}`}>
      {open ? (
        <div className="watch-experience-backdrop" onPointerDown={(event) => {
          if (event.target === event.currentTarget) closePanel();
        }}>
        <section ref={panelRef} id="watch-experience-panel" className="watch-experience-panel" role="dialog" aria-modal="true" aria-labelledby="watch-experience-title" tabIndex={-1}>
          <header className="watch-experience-heading">
            <span id="watch-experience-title"><Accessibility aria-hidden /> Viewing &amp; accessibility</span>
            <button type="button" onClick={() => { playFeedback(); closePanel(); }} aria-label="Close viewing and accessibility settings"><X aria-hidden /></button>
          </header>
          <p>Personalize Watch without losing your place. Changes apply immediately and are saved on this device.</p>

          <div className="watch-experience-summary" aria-live="polite">
            <span><Sparkles aria-hidden /> {activePreset === "custom" ? "Custom setup" : `${activePreset[0]?.toUpperCase()}${activePreset.slice(1)} setup`}</span>
            <small>{changedSettingCount ? `${changedSettingCount} change${changedSettingCount === 1 ? "" : "s"} from recommended` : "Recommended settings"}</small>
          </div>

          <fieldset className="watch-experience-group">
            <legend>Quick presets</legend>
            <div className="watch-experience-presets" aria-label="Viewing presets">
              {(["recommended", "cinematic", "focus", "quiet", "accessible"] as const).map((preset) => (
                <button key={preset} type="button" aria-pressed={activePreset === preset} onClick={() => applyPreset(preset)}>
                  {preset === "recommended" ? "Recommended" : preset[0]?.toUpperCase() + preset.slice(1)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="watch-experience-group">
            <legend>Viewing</legend>
            <div className="watch-experience-field">
              <span><b>Motion</b><small>How lively page transitions feel.</small></span>
              <WatchSelect compact tone="dark" ariaLabel="Motion" value={preferences.motion} onChange={(value) => update({ motion: value as MotionMode })} options={[{ id: "calm", label: "Calm" }, { id: "standard", label: "Standard" }, { id: "cinematic", label: "Cinematic" }]} />
            </div>
            <div className="watch-experience-field">
              <span><b>Layout</b><small>Comfortable browsing density.</small></span>
              <WatchSelect compact tone="dark" ariaLabel="Layout density" value={preferences.density} onChange={(value) => update({ density: value as DensityMode })} options={[{ id: "compact", label: "Compact guide" }, { id: "balanced", label: "Balanced" }, { id: "theater", label: "Large-screen TV" }]} />
            </div>
            <div className="watch-experience-field">
              <span><b>Station glow</b><small>Color around the channel you browse.</small></span>
              <WatchSelect compact tone="dark" ariaLabel="Station glow" value={preferences.theme} onChange={(value) => update({ theme: value as StationTheme })} options={[{ id: "auto", label: "Follow what I browse" }, { id: "core", label: "CORE" }, { id: "stable", label: "Stable" }, { id: "flock", label: "Flock" }, { id: "thugs", label: "Thugs" }, { id: "m3", label: "M3" }, { id: "nms", label: "NMS" }, { id: "slg", label: "SLG" }]} />
            </div>
            <button type="button" className="watch-experience-row-toggle" aria-pressed={preferences.ambient} onClick={() => update({ ambient: !preferences.ambient })}>
              <span><b>Ambient artwork</b><small>Use artwork colors behind Watch.</small></span><b>{preferences.ambient ? "On" : "Off"}</b>
            </button>
          </fieldset>

          <fieldset className="watch-experience-group">
            <legend>Navigation</legend>
            <div className="watch-experience-field">
              <span><b>Cursor theme</b><small>Choose a familiar or community pointer.</small></span>
              <WatchSelect compact tone="dark" ariaLabel="Cursor theme" value={preferences.cursorTheme} onChange={(value) => update({ cursorTheme: value as CursorTheme })} options={[{ id: "station", label: "Match community" }, { id: "mono", label: "Studio white" }, { id: "gold", label: "Cinema gold" }, { id: "core", label: "CORE signal" }, { id: "flock", label: "Flock sunset" }, { id: "stable", label: "Stable blue glass" }, { id: "thugs", label: "Thugs ink" }, { id: "m3", label: "M3 chrome" }, { id: "nms", label: "NMS electric" }, { id: "slg", label: "SLG gold" }]} />
            </div>
            <div className="watch-experience-field">
              <span><b>Cursor effects</b><small>Keep the pointer expressive or quiet.</small></span>
              <WatchSelect compact tone="dark" ariaLabel="Cursor effects" value={preferences.cursorFx} onChange={(value) => update({ cursorFx: value as CursorFx })} options={[{ id: "signature", label: "Signature effects" }, { id: "quiet", label: "Quiet motion" }]} />
            </div>
            <div className="watch-experience-field">
              <span><b>Cursor size</b><small>Make the pointer easier to find.</small></span>
              <WatchSelect compact tone="dark" ariaLabel="Cursor size" value={preferences.cursorSize} onChange={(value) => update({ cursorSize: value as CursorSize })} options={[{ id: "standard", label: "Standard" }, { id: "large", label: "Large" }]} />
            </div>
            <div className="watch-experience-field">
              <span><b>Helpful hints</b><small>Explain controls when you pause over them.</small></span>
              <WatchSelect compact tone="dark" ariaLabel="Cursor hints" value={preferences.cursorHints} onChange={(value) => update({ cursorHints: value as CursorHints })} options={[{ id: "smart", label: "Smart" }, { id: "off", label: "Off" }]} />
            </div>
          </fieldset>

          <fieldset className="watch-experience-group">
            <legend>Accessibility</legend>
            <div className="watch-experience-field">
              <span><b>Text size</b><small>Scale key Watch text for readability.</small></span>
              <WatchSelect compact tone="dark" ariaLabel="Text size" value={preferences.textSize} onChange={(value) => update({ textSize: value as TextSize })} options={[{ id: "standard", label: "Standard" }, { id: "large", label: "Large" }]} />
            </div>
            <div className="watch-experience-field">
              <span><b>Contrast</b><small>Increase separation between controls.</small></span>
              <WatchSelect compact tone="dark" ariaLabel="Contrast" value={preferences.contrast} onChange={(value) => update({ contrast: value as ContrastMode })} options={[{ id: "standard", label: "Standard" }, { id: "high", label: "High contrast" }, { id: "oled", label: "OLED black" }]} />
            </div>
            <div className="watch-experience-field">
              <span><b>Reduce motion</b><small>Follow your device or minimize animation.</small></span>
              <WatchSelect compact tone="dark" ariaLabel="Reduced motion" value={preferences.reducedMotion} onChange={(value) => update({ reducedMotion: value as ReducedMotion })} options={[{ id: "system", label: "Use device setting" }, { id: "on", label: "Reduce motion" }]} />
            </div>
            <div className="watch-experience-checks" aria-label="Accessibility status">
              <span><Check aria-hidden /> Keyboard ready</span>
              <span><Check aria-hidden /> {preferences.reducedMotion === "on" ? "Motion reduced" : "Motion follows device"}</span>
              <span><Check aria-hidden /> {preferences.contrast === "high" ? "High contrast" : "Contrast available"}</span>
            </div>
          </fieldset>

          <fieldset className="watch-experience-group">
            <legend>Audio &amp; playback</legend>
            <div className="watch-experience-field">
              <span><b>Autoplay previews</b><small>Preview content silently, or not at all.</small></span>
              <WatchSelect compact tone="dark" ariaLabel="Autoplay previews" value={preferences.autoplay} onChange={(value) => update({ autoplay: value as AutoplayMode })} options={[{ id: "muted", label: "Muted previews" }, { id: "off", label: "Off" }]} />
            </div>
            <button type="button" className="watch-experience-row-toggle" aria-pressed={preferences.sound} onClick={() => update({ sound: !preferences.sound })}>
              <span><b>Interface sound</b><small>Optional soft feedback after a click.</small></span>{preferences.sound ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}<b>{preferences.sound ? "On" : "Off"}</b>
            </button>
            <button type="button" className="watch-experience-leanback" aria-pressed={leanBack} onClick={() => { playFeedback(); setLeanBack((current) => !current); }}>
              <Maximize2 aria-hidden /> <span><b>{leanBack ? "Exit lean-back" : "Lean-back mode"}</b><small>Give Watch the room and keep controls larger.</small></span><kbd>L</kbd>
            </button>
          </fieldset>

          <footer className="watch-experience-footer">
            <button type="button" disabled={!undoPreferences} onClick={() => {
              if (!undoPreferences) return;
              playFeedback(); autoplayTouched.current = true; setPreferences(undoPreferences); setUndoPreferences(null); setActivePreset("custom");
            }}>Undo last change</button>
            <button type="button" onClick={restoreDefaults}><RotateCcw aria-hidden /> Reset recommended</button>
          </footer>
        </section>
        </div>
      ) : null}
      <button ref={triggerRef} type="button" className="watch-experience-trigger" aria-expanded={open} aria-controls="watch-experience-panel" onClick={() => { playFeedback(); setOpen((current) => !current); }}>
        <Settings2 aria-hidden /><span>Accessibility</span>{changedSettingCount ? <b aria-label={`${changedSettingCount} customized settings`}>{changedSettingCount}</b> : null}
      </button>
    </div>
  );
}
