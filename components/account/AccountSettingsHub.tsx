"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Accessibility,
  ArrowUpRight,
  Eye,
  Palette,
  Play,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { Toggle } from "@/components/base/toggle/toggle";
import { NativeSelect } from "@/components/base/select/select-native";
import { usePlayer, type AccessibilityPreset, type QualityPreference } from "@/components/providers/PlayerProvider";
import { useTheme, type Accent, type Theme } from "@/components/providers/ThemeProvider";
import type { AutoplayMode } from "@/lib/watch/workspace";
import type { PlayerCompanionView } from "@/lib/watch/player-companion";
import {
  normalizeRadioAudioSettings,
  readRadioAudioSettings,
  writeRadioAudioSettings,
  type RadioAudioSettings,
  type RadioCaptionPreference,
} from "@/lib/radio/settings";
import { cx } from "@/utils/cx";

type LandingPage = "/watch" | "/guide" | "/chat" | "/account";

type AccountSettings = {
  theme: Theme;
  accent: Accent;
  density: "comfortable" | "compact";
  reduceMotion: boolean;
  highContrast: boolean;
  landingPage: LandingPage;
  personalizeRecommendations: boolean;
  showMatureContent: boolean;
  privateSession: boolean;
  publicProfile: boolean;
  showActivity: boolean;
};

type PlayerSettings = {
  autoplayMode: AutoplayMode;
  previewAutoplay: boolean;
  previewSoundEnabled: boolean;
  previewVolume: number;
  dataSaver: boolean;
  ambientLighting: boolean;
  captionsEnabled: boolean;
  playbackRate: number;
  qualityPreference: QualityPreference;
  audioDescription: boolean;
  accessibilityPreset: AccessibilityPreset;
  companionView: PlayerCompanionView;
  mixAudio: boolean;
  maxActivePlayers: number;
};

const LANDING_OPTIONS: ReadonlyArray<{ value: LandingPage; label: string }> = [
  { value: "/watch", label: "Watch" },
  { value: "/guide", label: "Guide" },
  { value: "/chat", label: "Chat" },
  { value: "/account", label: "My account" },
];

const AUTOPLAY_OPTIONS: ReadonlyArray<{ value: AutoplayMode; label: string }> = [
  { value: "off", label: "Off" },
  { value: "live-first", label: "Live first" },
  { value: "queue", label: "Queue" },
  { value: "same-creator", label: "Same creator" },
];

const QUALITY_OPTIONS: ReadonlyArray<{ value: QualityPreference; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "best", label: "Best" },
  { value: "balanced", label: "Balanced" },
  { value: "data-saver", label: "Data saver" },
];

const COMPANION_OPTIONS: ReadonlyArray<{ value: PlayerCompanionView; label: string }> = [
  { value: "details", label: "Details" },
  { value: "up-next", label: "Up next" },
  { value: "chat", label: "Chat" },
];

const RADIO_CAPTION_OPTIONS: ReadonlyArray<{ value: RadioCaptionPreference; label: string }> = [
  { value: "always", label: "Always" },
  { value: "fallback", label: "When blocked" },
  { value: "off", label: "Off" },
];

function defaultSettings(theme: Theme, accent: Accent): AccountSettings {
  return {
    theme,
    accent,
    density: "comfortable",
    reduceMotion: false,
    highContrast: false,
    landingPage: "/watch",
    personalizeRecommendations: true,
    showMatureContent: false,
    privateSession: false,
    publicProfile: false,
    showActivity: false,
  };
}

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

function isAccent(value: unknown): value is Accent {
  return value === "core" || value === "stable" || value === "thugs" || value === "flock" || value === "nms" || value === "m3";
}

function restoreSettings(value: unknown, defaults: AccountSettings): AccountSettings {
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Partial<AccountSettings>;
  const bool = (key: keyof AccountSettings) => typeof raw[key] === "boolean" ? raw[key] as boolean : defaults[key] as boolean;
  return {
    theme: isTheme(raw.theme) ? raw.theme : defaults.theme,
    accent: isAccent(raw.accent) ? raw.accent : defaults.accent,
    density: raw.density === "compact" ? "compact" : "comfortable",
    reduceMotion: bool("reduceMotion"),
    highContrast: bool("highContrast"),
    landingPage: LANDING_OPTIONS.some(({ value: option }) => option === raw.landingPage)
      ? raw.landingPage as LandingPage : defaults.landingPage,
    personalizeRecommendations: bool("personalizeRecommendations"),
    showMatureContent: bool("showMatureContent"),
    privateSession: bool("privateSession"),
    publicProfile: bool("publicProfile"),
    showActivity: bool("showActivity"),
  };
}

function applyExperience(settings: AccountSettings) {
  document.documentElement.dataset.density = settings.density;
  document.documentElement.dataset.reducedMotion = String(settings.reduceMotion);
  document.documentElement.dataset.contrast = settings.highContrast ? "more" : "standard";
}

function isAutoplayMode(value: unknown): value is AutoplayMode {
  return value === "off" || value === "queue" || value === "same-creator" || value === "similar" || value === "live-first" || value === "keep-grid-full";
}

function isQualityPreference(value: unknown): value is QualityPreference {
  return value === "auto" || value === "best" || value === "balanced" || value === "data-saver";
}

function isAccessibilityPreset(value: unknown): value is AccessibilityPreset {
  return value === "standard" || value === "captions" || value === "audio-description" || value === "calm";
}

function isCompanionView(value: unknown): value is PlayerCompanionView {
  return value === "details" || value === "up-next" || value === "chat";
}

export function AccountSettingsHub() {
  const player = usePlayer();
  const { theme, accent, setTheme, setAccent } = useTheme();
  const [settings, setSettings] = useState<AccountSettings>(() => defaultSettings(theme, accent));
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [radioSettings, setRadioSettings] = useState<RadioAudioSettings>(() => readRadioAudioSettings());

  const persist = useCallback(async (next: AccountSettings) => {
    setSaveState("saving");
    try {
      const response = await fetch("/api/account/workspaces", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "account-settings", name: "experience", payload: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, []);

  const playerSettings = useCallback((): PlayerSettings => ({
    autoplayMode: player.autoplayMode,
    previewAutoplay: player.previewAutoplay,
    previewSoundEnabled: player.previewSoundEnabled,
    previewVolume: player.previewVolume,
    dataSaver: player.dataSaver,
    ambientLighting: player.ambientLighting,
    captionsEnabled: player.captionsEnabled,
    playbackRate: player.playbackRate,
    qualityPreference: player.qualityPreference,
    audioDescription: player.audioDescription,
    accessibilityPreset: player.accessibilityPreset,
    companionView: player.companionView,
    mixAudio: player.mixAudio,
    maxActivePlayers: player.maxActivePlayers,
  }), [player]);

  const persistPlayer = useCallback(async (patch: Partial<PlayerSettings>) => {
    const next = { ...playerSettings(), ...patch };
    try {
      const response = await fetch("/api/account/workspaces", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "account-settings", name: "player", payload: next }),
      });
      if (!response.ok) throw new Error(`player_settings_${response.status}`);
    } catch {
      // Local player preferences still persist through PlayerProvider, but the
      // shared save indicator must make a failed account sync visible.
      setSaveState("error");
    }
  }, [playerSettings]);

  const persistRadio = useCallback(async (next: RadioAudioSettings) => {
    try {
      const response = await fetch("/api/account/workspaces", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "account-settings", name: "radio", payload: next }),
      });
      if (!response.ok) throw new Error(`radio_settings_${response.status}`);
    } catch {
      // The local listener preference remains active, but failed account sync
      // should not be presented as if it were saved remotely.
      setSaveState("error");
    }
  }, []);

  const updatePlayer = useCallback((patch: Partial<PlayerSettings>) => {
    if (patch.autoplayMode !== undefined) player.setAutoplayMode(patch.autoplayMode);
    if (patch.previewAutoplay !== undefined) player.setPreviewAutoplay(patch.previewAutoplay);
    if (patch.previewSoundEnabled !== undefined) player.setPreviewSoundEnabled(patch.previewSoundEnabled);
    if (patch.previewVolume !== undefined) player.setPreviewVolume(patch.previewVolume);
    if (patch.dataSaver !== undefined) player.setDataSaver(patch.dataSaver);
    if (patch.ambientLighting !== undefined) player.setAmbientLighting(patch.ambientLighting);
    if (patch.captionsEnabled !== undefined) player.setCaptionsEnabled(patch.captionsEnabled);
    if (patch.playbackRate !== undefined) player.setPlaybackRate(patch.playbackRate);
    if (patch.qualityPreference !== undefined) player.setQualityPreference(patch.qualityPreference);
    if (patch.audioDescription !== undefined) player.setAudioDescription(patch.audioDescription);
    if (patch.accessibilityPreset !== undefined) player.applyAccessibilityPreset(patch.accessibilityPreset);
    if (patch.companionView !== undefined) player.setCompanionView(patch.companionView);
    if (patch.mixAudio !== undefined) player.setMixAudio(patch.mixAudio);
    if (patch.maxActivePlayers !== undefined) player.setMaxActivePlayers(patch.maxActivePlayers);
    void persistPlayer(patch);
  }, [persistPlayer, player]);

  const updateRadio = useCallback((patch: Partial<RadioAudioSettings>) => {
    setRadioSettings((current) => {
      const next = writeRadioAudioSettings({ ...current, ...patch });
      void persistRadio(next);
      return next;
    });
  }, [persistRadio]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const preferencesResponse = await fetch("/api/account/workspaces?kind=account-settings", { credentials: "same-origin", signal: controller.signal });
        if (preferencesResponse.ok) {
          const data = await preferencesResponse.json() as { items?: Array<{ name: string; payload: unknown }> };
          const stored = data.items?.find((item) => item.name === "experience")?.payload;
          const next = restoreSettings(stored, defaultSettings(theme, accent));
          setSettings(next);
          setTheme(next.theme);
          setAccent(next.accent);
          applyExperience(next);
          const playerStored = data.items?.find((item) => item.name === "player")?.payload;
          if (playerStored && typeof playerStored === "object") {
            const saved = playerStored as Partial<PlayerSettings>;
            if (isAutoplayMode(saved.autoplayMode)) player.setAutoplayMode(saved.autoplayMode);
            if (typeof saved.previewAutoplay === "boolean") player.setPreviewAutoplay(saved.previewAutoplay);
            if (typeof saved.previewSoundEnabled === "boolean") player.setPreviewSoundEnabled(saved.previewSoundEnabled);
            if (typeof saved.previewVolume === "number") player.setPreviewVolume(saved.previewVolume);
            if (typeof saved.dataSaver === "boolean") player.setDataSaver(saved.dataSaver);
            if (typeof saved.ambientLighting === "boolean") player.setAmbientLighting(saved.ambientLighting);
            if (typeof saved.captionsEnabled === "boolean") player.setCaptionsEnabled(saved.captionsEnabled);
            if (typeof saved.playbackRate === "number") player.setPlaybackRate(saved.playbackRate);
            if (isQualityPreference(saved.qualityPreference)) player.setQualityPreference(saved.qualityPreference);
            if (typeof saved.audioDescription === "boolean") player.setAudioDescription(saved.audioDescription);
            if (isAccessibilityPreset(saved.accessibilityPreset)) player.applyAccessibilityPreset(saved.accessibilityPreset);
            if (isCompanionView(saved.companionView)) player.setCompanionView(saved.companionView);
            if (typeof saved.mixAudio === "boolean") player.setMixAudio(saved.mixAudio);
            if (typeof saved.maxActivePlayers === "number") player.setMaxActivePlayers(saved.maxActivePlayers);
          }
          const radioStored = data.items?.find((item) => item.name === "radio")?.payload;
          if (radioStored) {
            const nextRadioSettings = normalizeRadioAudioSettings(radioStored);
            setRadioSettings(nextRadioSettings);
            writeRadioAudioSettings(nextRadioSettings);
          }
        } else {
          applyExperience(defaultSettings(theme, accent));
        }
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") applyExperience(defaultSettings(theme, accent));
      } finally {
        if (!controller.signal.aborted) setReady(true);
      }
    })();
    return () => controller.abort();
  }, [accent, setAccent, setTheme, theme]);

  const update = useCallback((patch: Partial<AccountSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      if (patch.theme) setTheme(patch.theme);
      if (patch.accent) setAccent(patch.accent);
      applyExperience(next);
      void persist(next);
      return next;
    });
  }, [persist, setAccent, setTheme]);

  const saveLabel = useMemo(() => {
    if (!ready || saveState === "saving") return "Saving…";
    if (saveState === "error") return "Couldn’t save";
    return saveState === "saved" ? "Saved" : "Private to your account";
  }, [ready, saveState]);

  return (
    <div className="space-y-6">
      <section id="experience" className="scroll-mt-24 overflow-hidden rounded-2xl bg-secondary shadow-xl ring-1 ring-inset ring-secondary">
        <SectionHeader icon={Palette} eyebrow="Appearance" title="Theme and layout" detail="Changes apply immediately and sync to your signed-in account." status={saveLabel} error={saveState === "error"} />
        <div className="grid gap-6 border-t border-secondary p-5 sm:p-6 lg:grid-cols-2">
          <ChoiceGroup label="Theme" value={settings.theme} onChange={(value) => update({ theme: value as Theme })} options={[
            { value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "system", label: "System" },
          ]} />
          <ChoiceGroup label="Accent" value={settings.accent} onChange={(value) => update({ accent: value as Accent })} options={[
            { value: "core", label: "CORE" }, { value: "stable", label: "Stable" }, { value: "thugs", label: "Thugs" },
            { value: "flock", label: "Flock" }, { value: "nms", label: "NMS" }, { value: "m3", label: "M3" },
          ]} />
          <SelectRow label="Default landing page" value={settings.landingPage} onChange={(value) => update({ landingPage: value as LandingPage })} options={LANDING_OPTIONS} />
          <ChoiceGroup label="Content density" value={settings.density} onChange={(value) => update({ density: value as AccountSettings["density"] })} options={[
            { value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" },
          ]} />
          <ToggleRow label="Reduce motion" detail="Cuts nonessential animation throughout CORE." value={settings.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })} />
          <ToggleRow label="Higher contrast" detail="Strengthens text and divider contrast." value={settings.highContrast} onChange={(highContrast) => update({ highContrast })} />
        </div>
      </section>

      <section id="playback" className="scroll-mt-24 overflow-hidden rounded-2xl bg-secondary shadow-xl ring-1 ring-inset ring-secondary">
        <SectionHeader icon={Play} eyebrow="Playback" title="Your player defaults" detail="These controls use the same preferences as the theater player, previews, live streams, and multiview." />
        <div className="grid gap-5 border-t border-secondary p-5 sm:p-6 lg:grid-cols-2">
          <SelectRow label="Autoplay" value={player.autoplayMode} onChange={(value) => updatePlayer({ autoplayMode: value as AutoplayMode })} options={AUTOPLAY_OPTIONS} />
          <SelectRow label="Quality" value={player.qualityPreference} onChange={(value) => updatePlayer({ qualityPreference: value as QualityPreference })} options={QUALITY_OPTIONS} />
          <SelectRow label="Playback speed" value={String(player.playbackRate)} onChange={(value) => updatePlayer({ playbackRate: Number(value) })} options={[
            { value: "0.75", label: "0.75×" }, { value: "1", label: "1×" }, { value: "1.25", label: "1.25×" }, { value: "1.5", label: "1.5×" }, { value: "2", label: "2×" },
          ]} />
          <SelectRow label="Theater side panel" value={player.companionView} onChange={(value) => updatePlayer({ companionView: value as PlayerCompanionView })} options={COMPANION_OPTIONS} />
          <ToggleRow label="Autoplay previews" detail="Muted previews start as you browse." value={player.previewAutoplay} onChange={(previewAutoplay) => updatePlayer({ previewAutoplay })} />
          <ToggleRow label="Preview sound" detail="Allow sound after you turn it on for a preview." value={player.previewSoundEnabled} onChange={(previewSoundEnabled) => updatePlayer({ previewSoundEnabled })} />
          <ToggleRow label="Data saver" detail="Favors lower-bandwidth playback when available." value={player.dataSaver} onChange={(dataSaver) => updatePlayer({ dataSaver })} />
          <ToggleRow label="Ambient lighting" detail="Shows the color bloom around the theater frame." value={player.ambientLighting} onChange={(ambientLighting) => updatePlayer({ ambientLighting })} />
          <ToggleRow label="Captions" detail="Requests captions on supported providers." value={player.captionsEnabled} onChange={(captionsEnabled) => updatePlayer({ captionsEnabled })} />
          <ToggleRow label="Audio description" detail="Uses described audio where a provider offers it." value={player.audioDescription} onChange={(audioDescription) => updatePlayer({ audioDescription })} />
          <ToggleRow label="Mix multiview audio" detail="Keep one stream audible unless you deliberately enable mixing." value={player.mixAudio} onChange={(mixAudio) => updatePlayer({ mixAudio })} />
          <RangeRow label="Preview volume" value={player.previewVolume} min={0} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={(previewVolume) => updatePlayer({ previewVolume })} />
          <RangeRow label="Multiview screens" value={player.maxActivePlayers} min={1} max={8} step={1} format={(value) => String(value)} onChange={(maxActivePlayers) => updatePlayer({ maxActivePlayers })} />
        </div>
      </section>

      <section id="station-audio" className="scroll-mt-24 overflow-hidden rounded-2xl bg-secondary shadow-xl ring-1 ring-inset ring-secondary">
        <SectionHeader icon={Radio} eyebrow="Station audio" title="DJ Cora settings" detail="Every station line is an approved recording. These controls never generate speech or use AI credits." />
        <div className="grid gap-5 border-t border-secondary p-5 sm:p-6 lg:grid-cols-2">
          <ToggleRow label="Station audio" detail="Play short DJ Cora IDs and 24/7 handoff cues when your browser allows it." value={radioSettings.enabled} onChange={(enabled) => updateRadio({ enabled })} />
          <ChoiceGroup label="DJ Cora captions" value={radioSettings.captions} onChange={(captions) => updateRadio({ captions: captions as RadioCaptionPreference })} options={RADIO_CAPTION_OPTIONS} />
          <RangeRow label="DJ Cora volume" value={radioSettings.volume} min={0} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={(volume) => updateRadio({ volume })} />
          <ToggleRow label="Station data saver" detail="Skip warming optional Cora assets on this connection." value={radioSettings.dataSaver} onChange={(dataSaver) => updateRadio({ dataSaver })} />
        </div>
      </section>

      <section id="personalization" className="scroll-mt-24 overflow-hidden rounded-2xl bg-secondary shadow-xl ring-1 ring-inset ring-secondary">
        <SectionHeader icon={Eye} eyebrow="Personalization" title="Control what shapes your feed" detail="Favorites, follows, saves, likes, and Not interested feedback remain available from every content card." />
        <div className="grid gap-5 border-t border-secondary p-5 sm:p-6 lg:grid-cols-2">
          <ToggleRow label="Personalized recommendations" detail="Use your activity to improve For you and the Guide." value={settings.personalizeRecommendations} onChange={(personalizeRecommendations) => update({ personalizeRecommendations })} />
          <ToggleRow label="Show mature content" detail="Include content marked for mature audiences." value={settings.showMatureContent} onChange={(showMatureContent) => update({ showMatureContent })} />
          <LinkRow label="Manage my DVR" detail="Review saved videos, channels, and custom lists." href="/dvr" />
          <LinkRow label="Manage follows" detail="Choose creators and communities you want to hear from." href="/account#connected-accounts" />
        </div>
      </section>

      <section id="privacy" className="scroll-mt-24 overflow-hidden rounded-2xl bg-secondary shadow-xl ring-1 ring-inset ring-secondary">
        <SectionHeader icon={ShieldCheck} eyebrow="Privacy & safety" title="Decide what stays private" detail="CORE does not expose your watch activity or connected platforms without an explicit choice." />
        <div className="grid gap-5 border-t border-secondary p-5 sm:p-6 lg:grid-cols-2">
          <ToggleRow label="Private viewing session" detail="Keep this session out of recommendations and history." value={settings.privateSession} onChange={(privateSession) => update({ privateSession })} />
          <ToggleRow label="Public profile" detail="Let other signed-in fans see your public fan card." value={settings.publicProfile} onChange={(publicProfile) => update({ publicProfile })} />
          <ToggleRow label="Show activity" detail="Allow your public fan card to show recent CORE activity." value={settings.showActivity} onChange={(showActivity) => update({ showActivity })} />
          <LinkRow label="Connected accounts" detail="Review permissions, disconnect accounts, or sync on demand." href="/account#connected-accounts" />
        </div>
      </section>

      <section id="accessibility" className="scroll-mt-24 overflow-hidden rounded-2xl bg-secondary shadow-xl ring-1 ring-inset ring-secondary">
        <SectionHeader icon={Accessibility} eyebrow="Accessibility" title="Playback that works for you" detail="Your preset applies to captions, described audio, speed, and preview behavior immediately." />
        <div className="grid gap-5 border-t border-secondary p-5 sm:p-6 lg:grid-cols-2">
          <ChoiceGroup label="Player preset" value={player.accessibilityPreset} onChange={(value) => player.applyAccessibilityPreset(value as AccessibilityPreset)} options={[
            { value: "standard", label: "Standard" }, { value: "captions", label: "Captions" }, { value: "audio-description", label: "Described" }, { value: "calm", label: "Calm" },
          ]} />
          <LinkRow label="Keyboard shortcuts" detail="Space pauses playback; arrows seek when the player is focused." href="/watch" />
        </div>
      </section>

    </div>
  );
}

function SectionHeader({ icon: Icon, eyebrow, title, detail, status, error }: { icon: typeof Palette; eyebrow: string; title: string; detail: string; status?: string; error?: boolean }) {
  return <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6"><div className="flex min-w-0 items-start gap-3"><span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-brand-secondary ring-1 ring-inset ring-secondary"><Icon className="size-5" aria-hidden /></span><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-quaternary">{eyebrow}</p><h2 className="mt-1 text-lg font-semibold text-primary">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-tertiary">{detail}</p></div></div>{status ? <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", error ? "bg-error-primary text-error-primary ring-error_subtle" : "bg-primary text-tertiary ring-secondary")}>{status}</span> : null}</div>;
}

function ToggleRow({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex min-h-20 items-center justify-between gap-4 rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary"><div><p className="text-sm font-semibold text-primary">{label}</p><p className="mt-1 text-xs leading-5 text-tertiary">{detail}</p></div><Toggle size="md" isSelected={value} onChange={onChange} aria-label={label} /></div>;
}

function ChoiceGroup({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<{ value: string; label: string }> }) {
  return <div data-cursor-context={label} className="rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary"><p className="text-sm font-semibold text-primary">{label}</p><div className="mt-3 flex flex-wrap gap-2">{options.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={value === option.value} className={cx("min-h-9 rounded-lg px-3 text-xs font-semibold ring-1 ring-inset transition", value === option.value ? "bg-brand-primary text-brand-secondary ring-brand" : "bg-secondary text-tertiary ring-secondary hover:bg-primary_hover hover:text-secondary")}>{option.label}</button>)}</div></div>;
}

function SelectRow({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<{ value: string; label: string }> }) {
  return <div className="rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary"><NativeSelect label={label} value={value} onChange={(event) => onChange(event.target.value)} options={[...options]} /></div>;
}

function RangeRow({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (value: number) => string; onChange: (value: number) => void }) {
  return <label className="rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary"><span className="flex items-center justify-between text-sm font-semibold text-primary">{label}<span className="text-xs text-tertiary">{format(value)}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-4 w-full accent-[var(--core)]" aria-label={label} /></label>;
}

function LinkRow({ label, detail, href }: { label: string; detail: string; href: string }) {
  return <Link href={href as never} className="group flex min-h-20 items-center justify-between gap-4 rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary transition hover:bg-primary_hover"><div><p className="text-sm font-semibold text-primary">{label}</p><p className="mt-1 text-xs leading-5 text-tertiary">{detail}</p></div><ArrowUpRight className="size-4 shrink-0 text-tertiary transition group-hover:text-brand-secondary" aria-hidden /></Link>;
}
