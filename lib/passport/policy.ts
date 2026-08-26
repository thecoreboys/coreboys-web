import type { PassportPrivacy, PassportPrivacyLevel } from "@/lib/passport/types";

export const DEFAULT_PASSPORT_PRIVACY: PassportPrivacy = {
  profile: "public",
  inventory: "private",
  activity: "private",
  channelAffinity: "public",
};

export function passportLevelForXp(xp: number): number {
  const safe = Math.max(0, Math.floor(xp));
  return Math.floor(Math.sqrt(safe / 100)) + 1;
}

export function passportXpForLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return (safe - 1) ** 2 * 100;
}

export function passportNextLevelXp(xp: number): number {
  return passportXpForLevel(passportLevelForXp(xp) + 1);
}

export function passportLevelPercent(xp: number): number {
  const level = passportLevelForXp(xp);
  const floor = passportXpForLevel(level);
  const ceiling = passportXpForLevel(level + 1);
  return Math.max(0, Math.min(100, Math.round(((xp - floor) / (ceiling - floor)) * 100)));
}

export function normalizePassportPrivacy(value: unknown): PassportPrivacy {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const pick = (key: keyof PassportPrivacy): PassportPrivacyLevel => {
    const candidate = source[key];
    return candidate === "public" || candidate === "members" || candidate === "private"
      ? candidate
      : DEFAULT_PASSPORT_PRIVACY[key];
  };
  return {
    profile: pick("profile"),
    inventory: pick("inventory"),
    activity: pick("activity"),
    channelAffinity: pick("channelAffinity"),
  };
}

export function creditedHeartbeatSeconds(input: {
  previousReceivedAt: Date | null;
  receivedAt: Date;
  heartbeatIntervalSeconds: number;
  previousPlaying?: boolean;
  previousVisible?: boolean;
  previousPositionSeconds?: number | null;
  currentPositionSeconds?: number;
  sameSession?: boolean;
  playing: boolean;
  visible: boolean;
}): number {
  if (!input.playing || !input.visible || !input.previousPlaying || !input.previousVisible || !input.previousReceivedAt || input.sameSession===false) return 0;
  const elapsed = Math.floor((input.receivedAt.getTime() - input.previousReceivedAt.getTime()) / 1000);
  const positionDelta=Math.floor((input.currentPositionSeconds ?? 0)-(input.previousPositionSeconds ?? 0));
  if (elapsed <= 0||positionDelta<=0||positionDelta>elapsed*2+5) return 0;
  return Math.min(elapsed,positionDelta,Math.max(10, input.heartbeatIntervalSeconds * 2));
}

export function serverCreditedWatchSeconds(input:{
  previousPositionSeconds:number|null;
  currentPositionSeconds:number;
  previousGlobalTickAt:Date|null;
  receivedAt:Date;
  sameCanonicalRef:boolean;
}):number{
  if(!input.sameCanonicalRef||input.previousPositionSeconds===null||!input.previousGlobalTickAt)return 0;
  const wallSeconds=Math.floor((input.receivedAt.getTime()-input.previousGlobalTickAt.getTime())/1000);
  const positionDelta=Math.floor(input.currentPositionSeconds-input.previousPositionSeconds);
  if(wallSeconds<=0||positionDelta<=0||positionDelta>wallSeconds*2+5)return 0;
  return Math.min(120,wallSeconds,positionDelta);
}

export function passportWatchCompletionMinimum(durationSeconds:number|null,shortForm=false):number{
  if(!durationSeconds||durationSeconds<=0)return shortForm?10:300;
  // Short-form clips still require meaningful server-timed viewing, but the
  // threshold can never exceed the asset's actual duration.
  return Math.min(durationSeconds,Math.max(5,Math.ceil(durationSeconds*.8)));
}

export function passportPlaybackProviderIds(playbackRef:string,platform:string):string[]{
  const aliases=[playbackRef];
  const normalizedPlatform=platform.trim().toLowerCase();
  const prefixes=normalizedPlatform==="youtube"?["yt-"]
    :normalizedPlatform==="twitch"?["vod-","clip-twitch-","clip-"]
      :normalizedPlatform==="tiktok"?["tiktok-","tt-"]
        :normalizedPlatform==="instagram"?["instagram-","ig-"]
          :[];
  for(const prefix of prefixes){
    if(playbackRef.toLowerCase().startsWith(prefix)&&playbackRef.length>prefix.length)aliases.push(playbackRef.slice(prefix.length));
  }
  return [...new Set(aliases)];
}

export function passportEventTransitionAllowed(previous:string,next:string):boolean{
  if(previous===next)return true;
  const legal:Record<string,readonly string[]>={
    draft:["scheduled","live","cancelled"],
    scheduled:["draft","live","cancelled"],
    live:["ended","cancelled"],
    ended:["certified"],
    certified:[],
    cancelled:[],
  };
  return Boolean(legal[previous]?.includes(next));
}

export function passportPollTransitionAllowed(previous:string,next:string):boolean{
  if(previous===next)return true;
  const legal:Record<string,readonly string[]>={
    draft:["preview","live","cancelled"],
    preview:["draft","live","cancelled"],
    live:["locked","cancelled"],
    locked:["certified","cancelled"],
    certified:[],
    cancelled:[],
  };
  return Boolean(legal[previous]?.includes(next));
}

export function passportCurrencyRewardPolicy(type:"xp"|"sparks",amountInput:number):{
  amount:number;rarity:"common"|"rare"|"legendary";budgetUnits:number;
}{
  if(!Number.isInteger(amountInput)||amountInput<=0)throw new PassportError("invalid_input",400,"invalid_currency_reward_amount");
  if(type==="xp"){
    if(amountInput>1_000)throw new PassportError("invalid_input",400,"xp_reward_too_large");
    return {amount:amountInput,rarity:amountInput<=100?"common":amountInput<=500?"rare":"legendary",budgetUnits:Math.ceil(amountInput/100)};
  }
  if(amountInput>250)throw new PassportError("invalid_input",400,"sparks_reward_too_large");
  return {amount:amountInput,rarity:amountInput<=25?"common":amountInput<=100?"rare":"legendary",budgetUnits:Math.ceil(amountInput/25)};
}

export function presenceIsEligible(input: {
  watchSeconds: number;
  minimumWatchSeconds: number;
  heartbeatCount: number;
}): boolean {
  return input.watchSeconds >= input.minimumWatchSeconds && input.heartbeatCount >= 2;
}

export function publicSectionAllowed(
  level: PassportPrivacyLevel,
  viewerIsSignedIn: boolean,
  isOwner: boolean,
): boolean {
  if (isOwner) return true;
  if (level === "public") return true;
  return level === "members" && viewerIsSignedIn;
}

export function assertPassportNoSelfGrant(
  actorFanUserId: string | null,
  recipientUserIds: readonly string[],
): void {
  if (actorFanUserId && recipientUserIds.includes(actorFanUserId)) {
    throw new PassportError("forbidden", 403, "self_grant_not_allowed");
  }
}

export function assertPassportEligibleRewardRecipients(
  recipientUserIds: readonly string[],
  eligibleUserIds: readonly string[],
): void {
  const eligible = new Set(eligibleUserIds);
  if ([...new Set(recipientUserIds)].some((userId) => !eligible.has(userId))) {
    throw new PassportError("not_eligible", 409, "event_recipient_not_eligible");
  }
}

export function passportCompensatingDelta(originalDelta: number): number {
  return -Math.max(0, Math.floor(originalDelta));
}

export function passportUtcWeekKey(date: Date = new Date()): string {
  const utcDay = date.getUTCDay();
  const daysSinceMonday = (utcDay + 6) % 7;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday));
  return monday.toISOString().slice(0, 10);
}

export function sanitizePublicPassportProvenance(value: unknown): Record<string,unknown> {
  const source=value&&typeof value==="object"?value as Record<string,unknown>:{};
  const edition=source.edition&&typeof source.edition==="object"?source.edition as Record<string,unknown>:{};
  const safe:Record<string,unknown>={};
  for(const key of ["eventCode","eventTitle","variant"] as const){if(typeof source[key]==="string")safe[key]=source[key];}
  const signedBy=typeof edition.signedBy==="string"?edition.signedBy:typeof source.signedBy==="string"?source.signedBy:null;
  if(signedBy)safe.signedBy=signedBy;
  if(typeof edition.variant==="string")safe.variant=edition.variant;
  return safe;
}

export const PASSPORT_RATE_LIMITS: Record<string, { limit: number; windowSeconds: number }> = {
  "presence.heartbeat": { limit: 180, windowSeconds: 60 * 60 },
  "presence.claim": { limit: 30, windowSeconds: 60 * 60 },
  "watch.progress": { limit: 300, windowSeconds: 60 * 60 },
  "profile.update": { limit: 30, windowSeconds: 60 * 60 },
  "quest.claim": { limit: 20, windowSeconds: 60 * 60 },
  "album.claim": { limit: 20, windowSeconds: 60 * 60 },
  "card.craft": { limit: 10, windowSeconds: 60 * 60 },
  "gift.create": { limit: 5, windowSeconds: 24 * 60 * 60 },
  "gift.resolve": { limit: 30, windowSeconds: 60 * 60 },
  "trade.create": { limit: 5, windowSeconds: 24 * 60 * 60 },
  "trade.resolve": { limit: 30, windowSeconds: 60 * 60 },
  "appeal.create": { limit: 3, windowSeconds: 24 * 60 * 60 },
};

export class PassportError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "not_eligible"
      | "forbidden"
      | "conflict"
      | "expired"
      | "rate_limited"
      | "invalid_state"
      | "invalid_input",
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PassportError";
  }
}
