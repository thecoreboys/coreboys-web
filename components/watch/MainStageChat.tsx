"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Link2, MessageSquare, Settings2 } from "lucide-react";
import { ChatDock, EMPTY_CHAT_FILTERS, type ChatFeedFilters, type ChatSessionChannel } from "@/components/live/chat";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { DEFAULT_CHAT_DOCK_SIZE } from "@/lib/watch/workspace";

type MainStageChatProps = {
  channels: ChatSessionChannel[];
  selectedLogin: string | null;
  followsMain: boolean;
  onSelectChannel: (login: string | null) => void;
  textScale: number;
  onTextScaleChange: (scale: number) => void;
  showTimestamps: boolean;
  onTimestampsChange: (show: boolean) => void;
  width: number;
  onWidthChange: (width: number) => void;
};

export function MainStageChat(props: MainStageChatProps) {
  const { channels, selectedLogin, followsMain, onSelectChannel, textScale, showTimestamps } = props;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filters, setFilters] = useState<ChatFeedFilters>(EMPTY_CHAT_FILTERS);
  const selectedChannel = channels.find((channel) => channel.login === selectedLogin);

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#101014]" aria-label="Main stage Twitch chat">
      <div inert={settingsOpen} className="flex min-h-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3">
          <span className="inline-flex min-w-0 items-center gap-2 text-xs font-semibold text-white/85"><MessageSquare className="size-4 shrink-0 text-violet-300" aria-hidden />Twitch chat</span>
          <span className={`inline-flex min-w-0 items-center gap-1 text-[10px] ${followsMain ? "text-emerald-300/85" : "text-white/45"}`} aria-live="polite"><Link2 className="size-3 shrink-0" aria-hidden /><span className="truncate">{followsMain ? "Follows main" : "Browsing"}</span></span>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Chat settings" aria-haspopup="dialog" className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl text-white/60 transition hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Settings2 className="size-4" aria-hidden /></button>
        </header>
        {!followsMain ? <button type="button" onClick={() => onSelectChannel(null)} className="min-h-10 shrink-0 border-b border-white/8 px-3 text-left text-xs font-medium text-emerald-300 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-white">Return to main stage chat</button> : null}
        {selectedChannel ? (
          <ChatDock
            key={selectedChannel.login}
            channels={[selectedChannel]}
            mode="focused"
            focusedLogin={selectedChannel.login}
            textScale={textScale}
            showTimestamps={showTimestamps}
            filters={filters}
            onFiltersChange={setFilters}
            showToolbar={false}
            fillContainer
            themeOverride="dark"
            className="min-h-0 flex-1 p-2"
          />
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
            <div className="max-w-64"><MessageSquare className="mx-auto size-6 text-white/25" aria-hidden /><p className="mt-3 text-sm font-semibold text-white/75">Chat follows your main stage</p><p className="mt-2 text-xs leading-5 text-white/45">Choose a live stream with a linked Twitch channel. Its chat will appear here automatically.</p></div>
          </div>
        )}
      </div>
      {settingsOpen ? <MainStageChatSettings {...props} filters={filters} onFiltersChange={setFilters} onClose={() => setSettingsOpen(false)} /> : null}
    </section>
  );
}

function MainStageChatSettings({
  channels, selectedLogin, followsMain, onSelectChannel,
  textScale, onTextScaleChange, showTimestamps, onTimestampsChange,
  width, onWidthChange, filters, onFiltersChange, onClose,
}: MainStageChatProps & { filters: ChatFeedFilters; onFiltersChange: (filters: ChatFeedFilters) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);

  return (
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="main-chat-settings-title" tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }} className="absolute inset-0 z-30 flex min-h-0 flex-col bg-[#131317]">
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-white/10 px-2">
        <button type="button" onClick={onClose} aria-label="Back to chat" className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl text-white/65 transition hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-white"><ArrowLeft className="size-4" aria-hidden /></button>
        <h2 id="main-chat-settings-title" className="text-sm font-semibold text-white">Chat settings</h2>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4" data-lenis-prevent>
        <label className="block text-xs font-semibold text-white/80">Channel
          <select aria-label="Chat channel" value={followsMain ? "" : selectedLogin ?? ""} onChange={(event) => onSelectChannel(event.target.value || null)} className="mt-2 min-h-11 w-full cursor-pointer rounded-xl border border-white/15 bg-[#202025] px-3 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70">
            <option value="">Follow main stage</option>
            {channels.map((channel) => <option key={channel.login} value={channel.login}>{channel.displayName}</option>)}
          </select>
          <span className="mt-2 block text-[11px] font-normal leading-5 text-white/45">Switches automatically with the main stage, including phone controls. Browsing another chat lasts until the main stream changes.</span>
        </label>
        <label className="block text-xs font-semibold text-white/80"><span className="flex items-center justify-between">Text size <span className="font-normal tabular-nums text-white/50">{Math.round(textScale * 100)}%</span></span>
          <input aria-label="Chat text size" type="range" min={0.7} max={1.8} step={0.05} value={textScale} onChange={(event) => onTextScaleChange(Number(event.target.value))} className="mt-3 h-6 w-full cursor-pointer accent-white" />
        </label>
        <div className="space-y-4">
          <ChatSettingToggle label="Show timestamps" checked={showTimestamps} onChange={onTimestampsChange} />
          <ChatSettingToggle label="Hide bots" checked={Boolean(filters.hideBots)} onChange={(hideBots) => onFiltersChange({ ...filters, hideBots })} />
          <ChatSettingToggle label="Emotes only" checked={Boolean(filters.emotesOnly)} onChange={(emotesOnly) => onFiltersChange({ ...filters, emotesOnly })} />
        </div>
        <label className="block text-xs font-semibold text-white/80">Muted words
          <input aria-label="Muted chat words" value={(filters.mutedTerms ?? []).join(",")} onChange={(event) => onFiltersChange({ ...filters, mutedTerms: event.target.value.split(",") })} placeholder="Separate words with commas" className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-xs text-white outline-none placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-white/70" />
        </label>
        <label className="hidden text-xs font-semibold text-white/80 lg:block"><span className="flex items-center justify-between">Column width <span className="font-normal tabular-nums text-white/50">{width}px</span></span>
          <input aria-label="Chat column width" type="range" min={280} max={520} step={8} value={width} onChange={(event) => onWidthChange(Number(event.target.value))} className="mt-3 h-6 w-full cursor-pointer accent-white" />
        </label>
        <button type="button" onClick={() => { onSelectChannel(null); onTextScaleChange(1); onTimestampsChange(false); onWidthChange(DEFAULT_CHAT_DOCK_SIZE.side); onFiltersChange(EMPTY_CHAT_FILTERS); }} className="min-h-11 w-full cursor-pointer rounded-xl border border-white/12 px-3 text-xs font-semibold text-white/65 transition hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-white">Reset chat settings</button>
        {selectedLogin ? <a href={`https://www.twitch.tv/${encodeURIComponent(selectedLogin)}/chat`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 text-xs font-medium text-white/55 hover:text-white focus-visible:outline-2 focus-visible:outline-white">Open chat on Twitch <ExternalLink className="size-3" aria-hidden /></a> : null}
      </div>
    </section>
  );
}

function ChatSettingToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-8 cursor-pointer items-center justify-between gap-3 text-xs font-medium text-white/75"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 cursor-pointer accent-white" /></label>;
}
