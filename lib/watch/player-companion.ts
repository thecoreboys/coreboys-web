export type PlayerCompanionView = "up-next" | "chat" | "details";

type CompanionPlayable = {
  kind?: string | null;
  platform?: string | null;
  twitchLogin?: string | null;
};

type CompanionChannel = {
  id?: string | null;
  airing?: { status?: string | null } | null;
};

export function twitchLiveChatLogin(item: CompanionPlayable | null | undefined): string | null {
  if (item?.kind !== "live" || item.platform !== "twitch") return null;
  const login = item.twitchLogin?.trim();
  return login || null;
}

export function isGuideLiveTwitchPlayback(
  item: CompanionPlayable | null | undefined,
  channel: CompanionChannel | null | undefined,
): boolean {
  return Boolean(
    twitchLiveChatLogin(item)
      && (channel?.id?.endsWith(":live") || channel?.airing?.status === "live"),
  );
}

export function isCoreControlledTwitchLivePlayback(
  item: CompanionPlayable | null | undefined,
  {
    playerScreen,
    guideLivePlayback,
  }: {
    playerScreen: boolean;
    guideLivePlayback: boolean;
  },
): boolean {
  return Boolean(twitchLiveChatLogin(item) && (playerScreen || guideLivePlayback));
}

// Details is the default destination: it makes the player feel like a real
// channel guide before a viewer decides to browse the queue or chat.
const ALL_PLAYER_COMPANION_VIEWS: PlayerCompanionView[] = ["details", "up-next", "chat"];

export function playerCompanionViews(chatAvailable: boolean): PlayerCompanionView[] {
  return chatAvailable
    ? [...ALL_PLAYER_COMPANION_VIEWS]
    : ALL_PLAYER_COMPANION_VIEWS.filter((view) => view !== "chat");
}

export function normalizePlayerCompanionView(
  view: PlayerCompanionView,
  chatAvailable: boolean,
): PlayerCompanionView {
  return playerCompanionViews(chatAvailable).includes(view) ? view : "details";
}

export function movePlayerCompanionView(
  view: PlayerCompanionView,
  key: "ArrowLeft" | "ArrowRight" | "Home" | "End",
  chatAvailable: boolean,
): PlayerCompanionView {
  const views = playerCompanionViews(chatAvailable);
  if (key === "Home") return views[0] ?? "details";
  if (key === "End") return views.at(-1) ?? "details";
  const currentIndex = Math.max(0, views.indexOf(normalizePlayerCompanionView(view, chatAvailable)));
  const step = key === "ArrowRight" ? 1 : -1;
  return views[(currentIndex + step + views.length) % views.length] ?? "details";
}
