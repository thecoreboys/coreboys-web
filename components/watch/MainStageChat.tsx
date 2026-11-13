"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ExternalLink, Link2, MessageSquare, RotateCcw, Settings2 } from "lucide-react";
import { ChatDock, EMPTY_CHAT_FILTERS, type ChatFeedFilters, type ChatSessionChannel } from "@/components/live/chat";
import { WatchSelect } from "@/components/watch/WatchSelect";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { DEFAULT_CHAT_DOCK_SIZE } from "@/lib/watch/workspace";

/** Which chats the side panel shows: the main stage only, every room chat merged, or one per stream. */
export type RoomChatView = "main" | "combined" | "columns";

const ROOM_CHAT_VIEWS: Array<{ id: RoomChatView; label: string; description: string }> = [
  { id: "main", label: "Main view", description: "Chat for the stream in the main view" },
  { id: "combined", label: "All in one", description: "Every stream’s chat mixed into one feed" },
  { id: "columns", label: "Side by side", description: "A separate chat column for each stream" },
];

const TEXT_SIZES = [
  { value: 0.85, label: "Small" },
  { value: 1, label: "Default" },
  { value: 1.2, label: "Large" },
  { value: 1.45, label: "Huge" },
] as const;

const COLUMN_WIDTHS = [
  { value: 300, label: "Narrow" },
  { value: 368, label: "Standard" },
  { value: 440, label: "Wide" },
  { value: 520, label: "Widest" },
] as const;

function closest<T extends { value: number }>(choices: readonly T[], value: number) {
  return choices.reduce((best, choice) => Math.abs(choice.value - value) < Math.abs(best.value - value) ? choice : best);
}

type MainStageChatProps = {
  channels: ChatSessionChannel[];
  /** Connected chats for every stream in the room (used by All / Each). */
  roomChannels?: ChatSessionChannel[];
  view?: RoomChatView;
  onViewChange?: (view: RoomChatView) => void;
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
  const { channels, selectedLogin, followsMain, onSelectChannel, textScale, showTimestamps, roomChannels = [], onViewChange } = props;
  const multiChat = roomChannels.length > 1;
  const view: RoomChatView = multiChat ? props.view ?? "main" : "main";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filters, setFilters] = useState<ChatFeedFilters>(EMPTY_CHAT_FILTERS);
  const selectedChannel = channels.find((channel) => channel.login === selectedLogin);

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#101014]" aria-label="Main stage Twitch chat">
      <div inert={settingsOpen} className="flex min-h-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="inline-flex min-w-0 items-center gap-2 text-xs font-semibold text-white/90"><MessageSquare className="size-4 shrink-0 text-violet-300" aria-hidden /><span className="truncate">{view === "main" && selectedChannel ? selectedChannel.displayName : "Twitch chat"}</span></span>
            {view === "main" ? (
              <span className={`ml-6 inline-flex min-w-0 items-center gap-1 text-[10px] ${followsMain ? "text-emerald-300/85" : "text-amber-200/80"}`} aria-live="polite"><Link2 className="size-3 shrink-0" aria-hidden /><span className="truncate">{followsMain ? "Following the main view" : "Browsing another chat"}</span></span>
            ) : (
              <span className="ml-6 truncate text-[10px] text-white/50" aria-live="polite">{roomChannels.length} chats {view === "combined" ? "in one feed" : "side by side"}</span>
            )}
          </span>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Chat settings" aria-haspopup="dialog" className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl text-white/60 transition hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Settings2 className="size-4" aria-hidden /></button>
        </header>
        {multiChat && onViewChange ? (
          <div role="radiogroup" aria-label="Chats to show" className="mx-2 mt-2 grid shrink-0 grid-cols-3 gap-0.5 rounded-xl bg-white/[0.05] p-0.5 ring-1 ring-inset ring-white/10">
            {ROOM_CHAT_VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={view === option.id}
                title={option.description}
                onClick={() => onViewChange(option.id)}
                className={`min-h-9 cursor-pointer truncate rounded-[0.6rem] px-1.5 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-white ${view === option.id ? "bg-white text-[#101014] shadow-sm" : "text-white/60 hover:bg-white/8 hover:text-white"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {view !== "main" ? (
          <ChatDock
            key={view}
            channels={roomChannels}
            mode={view}
            textScale={textScale}
            showTimestamps={showTimestamps}
            filters={filters}
            onFiltersChange={setFilters}
            showToolbar={false}
            fillContainer
            themeOverride="dark"
            className="min-h-0 flex-1 p-2"
          />
        ) : <>
        {!followsMain ? <button type="button" onClick={() => onSelectChannel(null)} className="flex min-h-10 shrink-0 items-center gap-2 border-b border-white/8 px-3 text-left text-xs font-medium text-emerald-300 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-white"><Link2 className="size-3.5" aria-hidden />Back to the main view’s chat</button> : null}
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
            <div className="max-w-64"><MessageSquare className="mx-auto size-6 text-white/25" aria-hidden /><p className="mt-3 text-sm font-semibold text-white/75">Chat follows your main view</p><p className="mt-2 text-xs leading-5 text-white/45">Put a live Twitch stream in the main view and its chat appears here.</p></div>
          </div>
        )}
        </>}
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
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3" data-lenis-prevent>
        <ChatSettingSection title="Channel">
          <WatchSelect
            ariaLabel="Chat channel"
            tone="dark"
            value={followsMain ? FOLLOW_MAIN : selectedLogin ?? FOLLOW_MAIN}
            onChange={(value) => onSelectChannel(value === FOLLOW_MAIN ? null : value)}
            options={[
              { id: FOLLOW_MAIN, label: "Follow the main view" },
              ...channels.map((channel) => ({ id: channel.login, label: channel.displayName })),
            ]}
          />
          <p className="text-[11px] leading-5 text-white/45">Following switches chat whenever the main view changes, including from your phone. Picking a channel holds it until the main view changes.</p>
        </ChatSettingSection>
        <ChatSettingSection title="Display">
          <ChatSegmented label="Text size" value={closest(TEXT_SIZES, textScale).value} choices={TEXT_SIZES} onChange={onTextScaleChange} />
          <div className="hidden lg:block"><ChatSegmented label="Chat width" value={closest(COLUMN_WIDTHS, width).value} choices={COLUMN_WIDTHS} onChange={onWidthChange} /></div>
          <ChatSettingToggle label="Show timestamps" description="The time next to each message" checked={showTimestamps} onChange={onTimestampsChange} />
        </ChatSettingSection>
        <ChatSettingSection title="Filters">
          <ChatSettingToggle label="Hide bots" description="Skip messages from known chat bots" checked={Boolean(filters.hideBots)} onChange={(hideBots) => onFiltersChange({ ...filters, hideBots })} />
          <ChatSettingToggle label="Emotes only" description="Only show messages made of emotes" checked={Boolean(filters.emotesOnly)} onChange={(emotesOnly) => onFiltersChange({ ...filters, emotesOnly })} />
          <label className="block pt-1 text-xs font-medium text-white/80">Muted words
            <input aria-label="Muted chat words" value={(filters.mutedTerms ?? []).join(",")} onChange={(event) => onFiltersChange({ ...filters, mutedTerms: event.target.value.split(",") })} placeholder="spoilers, giveaway" className="mt-2 min-h-11 w-full rounded-xl border border-white/14 bg-[#202026] px-3 text-sm text-white outline-none transition placeholder:text-white/30 hover:border-white/25 focus-visible:ring-2 focus-visible:ring-white/70" />
            <span className="mt-1.5 block text-[11px] font-normal text-white/40">Hide messages with these words. Separate them with commas.</span>
          </label>
        </ChatSettingSection>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
          <button type="button" onClick={() => { onSelectChannel(null); onTextScaleChange(1); onTimestampsChange(false); onWidthChange(DEFAULT_CHAT_DOCK_SIZE.side); onFiltersChange(EMPTY_CHAT_FILTERS); }} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-2 text-xs font-semibold text-white/60 transition hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-white"><RotateCcw className="size-3.5" aria-hidden />Reset to defaults</button>
          {selectedLogin ? <a href={`https://www.twitch.tv/${encodeURIComponent(selectedLogin)}/chat`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-medium text-white/55 hover:text-white focus-visible:outline-2 focus-visible:outline-white">Open on Twitch <ExternalLink className="size-3" aria-hidden /></a> : null}
        </div>
      </div>
    </section>
  );
}

const FOLLOW_MAIN = "__follow-main__";

function ChatSettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white/[0.035] p-3 ring-1 ring-inset ring-white/8">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">{title}</h3>
      {children}
    </section>
  );
}

function ChatSegmented<T extends number>({ label, value, choices, onChange }: { label: string; value: T; choices: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-white/80">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid gap-0.5 rounded-xl bg-black/30 p-0.5 ring-1 ring-inset ring-white/10" style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}>
        {choices.map((choice) => (
          <button key={choice.label} type="button" role="radio" aria-checked={value === choice.value} onClick={() => onChange(choice.value)} className={`min-h-9 cursor-pointer truncate rounded-[0.6rem] px-1 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-white ${value === choice.value ? "bg-white text-[#101014] shadow-sm" : "text-white/60 hover:bg-white/8 hover:text-white"}`}>{choice.label}</button>
        ))}
      </div>
    </div>
  );
}

function ChatSettingToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
      <span className="min-w-0"><span className="block text-xs font-medium text-white/85">{label}</span><span className="block text-[11px] text-white/40">{description}</span></span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-emerald-400" : "bg-white/15"}`} aria-hidden>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
