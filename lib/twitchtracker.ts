import { z } from "zod";

const TWITCHTRACKER_API_ORIGIN = "https://twitchtracker.com";
const CHANNEL_LOGIN_RE = /^[A-Za-z0-9_]{1,25}$/;
const MAX_GAME_LOOKUP_LENGTH = 160;
const DEFAULT_TIMEOUT_MS = 8_000;

export const TWITCHTRACKER_WINDOW_DAYS = 30;

const ChannelSummaryPayloadSchema = z
  .object({
    rank: z.number().int().nonnegative().nullable(),
    minutes_streamed: z.number().int().nonnegative(),
    avg_viewers: z.number().int().nonnegative(),
    max_viewers: z.number().int().nonnegative(),
    hours_watched: z.number().int().nonnegative(),
    // TwitchTracker documents the whole summary as a rolling 30-day
    // window. Keep follower gain signed so a future net-change response
    // can represent a shrinking audience without failing validation.
    followers: z.number().int(),
    followers_total: z.number().int().nonnegative(),
  })
  .passthrough();

const GameSummaryPayloadSchema = z
  .object({
    rank: z.number().int().nonnegative().nullable(),
    avg_viewers: z.number().int().nonnegative(),
    // The API currently returns an integer, but an average is allowed to
    // become fractional without forcing a schema migration.
    avg_channels: z.number().finite().nonnegative(),
    hours_watched: z.number().int().nonnegative(),
  })
  .passthrough();

export type TwitchTrackerChannelSummary = {
  rank: number | null;
  minutesStreamed: number;
  avgViewers: number;
  maxViewers: number;
  hoursWatched: number;
  followersGained: number;
  followersTotal: number;
  rawPayload: Record<string, unknown>;
};

export type TwitchTrackerGameSummary = {
  rank: number | null;
  avgViewers: number;
  avgChannels: number;
  hoursWatched: number;
  rawPayload: Record<string, unknown>;
};

export type TwitchTrackerFetchOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export class TwitchTrackerInputError extends Error {
  override name = "TwitchTrackerInputError";
}

export class TwitchTrackerHttpError extends Error {
  override name = "TwitchTrackerHttpError";
  readonly status: number;

  constructor(status: number) {
    super(`TwitchTracker request failed with HTTP ${status}`);
    this.status = status;
  }
}

export class TwitchTrackerSchemaError extends Error {
  override name = "TwitchTrackerSchemaError";
  readonly resource: "channel" | "game";

  constructor(resource: "channel" | "game", detail: string) {
    super(`Invalid TwitchTracker ${resource} summary: ${detail}`);
    this.resource = resource;
  }
}

export class TwitchTrackerRequestError extends Error {
  override name = "TwitchTrackerRequestError";

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
  }
}

function isEmptyObject(value: unknown): value is Record<string, never> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0,
  );
}

function schemaDetail(error: z.ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
    .join("; ");
}

/**
 * Normalize a channel response without coercing strings or filling missing
 * values. TwitchTracker returns HTTP 200 + `{}` for an unknown channel; that
 * is deliberately represented as `null`, never a row of zeroes.
 */
export function normalizeTwitchTrackerChannelSummary(
  value: unknown,
): TwitchTrackerChannelSummary | null {
  if (isEmptyObject(value)) return null;
  const parsed = ChannelSummaryPayloadSchema.safeParse(value);
  if (!parsed.success) {
    throw new TwitchTrackerSchemaError("channel", schemaDetail(parsed.error));
  }
  return {
    rank: parsed.data.rank,
    minutesStreamed: parsed.data.minutes_streamed,
    avgViewers: parsed.data.avg_viewers,
    maxViewers: parsed.data.max_viewers,
    hoursWatched: parsed.data.hours_watched,
    followersGained: parsed.data.followers,
    followersTotal: parsed.data.followers_total,
    rawPayload: { ...parsed.data },
  };
}

/** Normalize a Twitch-wide game/category summary. */
export function normalizeTwitchTrackerGameSummary(
  value: unknown,
): TwitchTrackerGameSummary | null {
  if (isEmptyObject(value)) return null;
  const parsed = GameSummaryPayloadSchema.safeParse(value);
  if (!parsed.success) {
    throw new TwitchTrackerSchemaError("game", schemaDetail(parsed.error));
  }
  return {
    rank: parsed.data.rank,
    avgViewers: parsed.data.avg_viewers,
    avgChannels: parsed.data.avg_channels,
    hoursWatched: parsed.data.hours_watched,
    rawPayload: { ...parsed.data },
  };
}

export function buildTwitchTrackerChannelSummaryUrl(login: string): string {
  const normalized = login.trim().toLowerCase();
  if (!CHANNEL_LOGIN_RE.test(normalized)) {
    throw new TwitchTrackerInputError("Invalid Twitch channel login");
  }
  return `${TWITCHTRACKER_API_ORIGIN}/api/channels/summary/${encodeURIComponent(normalized)}`;
}

export function buildTwitchTrackerGameSummaryUrl(idOrFullName: string): string {
  const normalized = idOrFullName.trim();
  if (!normalized || normalized.length > MAX_GAME_LOOKUP_LENGTH) {
    throw new TwitchTrackerInputError("Invalid Twitch game id or full name");
  }
  return `${TWITCHTRACKER_API_ORIGIN}/api/games/summary/${encodeURIComponent(normalized)}`;
}

async function fetchJson(
  url: string,
  resource: "channel" | "game",
  options: TwitchTrackerFetchOptions,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 250), 30_000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) controller.abort(options.signal.reason);
  else options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "thecoreboys.com metrics snapshot/1.0",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new TwitchTrackerHttpError(response.status);
    try {
      return await response.json();
    } catch {
      throw new TwitchTrackerSchemaError(resource, "response was not valid JSON");
    }
  } catch (error) {
    if (
      error instanceof TwitchTrackerHttpError ||
      error instanceof TwitchTrackerSchemaError
    ) {
      throw error;
    }
    const reason = controller.signal.aborted
      ? `TwitchTracker request timed out or was aborted after ${timeoutMs}ms`
      : "TwitchTracker request failed";
    throw new TwitchTrackerRequestError(reason, error);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export async function fetchTwitchTrackerChannelSummary(
  login: string,
  options: TwitchTrackerFetchOptions = {},
): Promise<TwitchTrackerChannelSummary | null> {
  const value = await fetchJson(buildTwitchTrackerChannelSummaryUrl(login), "channel", options);
  return normalizeTwitchTrackerChannelSummary(value);
}

export async function fetchTwitchTrackerGameSummary(
  idOrFullName: string,
  options: TwitchTrackerFetchOptions = {},
): Promise<TwitchTrackerGameSummary | null> {
  const value = await fetchJson(buildTwitchTrackerGameSummaryUrl(idOrFullName), "game", options);
  return normalizeTwitchTrackerGameSummary(value);
}
