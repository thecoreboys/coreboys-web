/**
 * Browser-side Twitch chat client. Connects anonymously over the IRC
 * WebSocket gateway, parses IRCv3-tagged PRIVMSGs, and merges in emote
 * sets from BTTV + 7TV. No server is involved at runtime — once the
 * server has handed us a Twitch numeric user ID, the rest is direct
 * fetches from the public emote CDNs and a WS to chat.twitch.tv.
 */

export type ChatBadge = { setId: string; version: string };

export type ChatToken =
  | { kind: "text"; text: string }
  | { kind: "emote"; code: string; url: string; provider: "twitch" | "bttv" | "7tv" };

export type ChatMessage = {
  id: string;
  user: string;
  displayName: string;
  color?: string;
  badges: ChatBadge[];
  tokens: ChatToken[];
  raw: string;
  receivedAt: number;
};

type ParsedTags = Record<string, string>;

/**
 * IRCv3 tag values escape `;`, ` `, `\r`, `\n`, `\` per the spec.
 */
function unescapeTagValue(v: string): string {
  let out = "";
  for (let i = 0; i < v.length; i++) {
    if (v[i] === "\\" && i + 1 < v.length) {
      const next = v[i + 1];
      if (next === ":") out += ";";
      else if (next === "s") out += " ";
      else if (next === "r") out += "\r";
      else if (next === "n") out += "\n";
      else if (next === "\\") out += "\\";
      else out += next;
      i++;
    } else {
      out += v[i];
    }
  }
  return out;
}

function parseTags(raw: string): ParsedTags {
  const out: ParsedTags = {};
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      out[part] = "";
    } else {
      out[part.slice(0, eq)] = unescapeTagValue(part.slice(eq + 1));
    }
  }
  return out;
}

type ParsedLine = {
  tags: ParsedTags;
  prefix: string;
  command: string;
  params: string[];
};

function parseLine(line: string): ParsedLine | null {
  if (!line) return null;
  let i = 0;
  let tags: ParsedTags = {};
  if (line[0] === "@") {
    const sp = line.indexOf(" ");
    if (sp === -1) return null;
    tags = parseTags(line.slice(1, sp));
    i = sp + 1;
  }
  let prefix = "";
  if (line[i] === ":") {
    const sp = line.indexOf(" ", i);
    if (sp === -1) return null;
    prefix = line.slice(i + 1, sp);
    i = sp + 1;
  }
  const rest = line.slice(i);
  const params: string[] = [];
  let j = 0;
  while (j < rest.length) {
    if (rest[j] === ":") {
      params.push(rest.slice(j + 1));
      break;
    }
    const sp = rest.indexOf(" ", j);
    if (sp === -1) {
      params.push(rest.slice(j));
      break;
    }
    params.push(rest.slice(j, sp));
    j = sp + 1;
  }
  const command = params[0];
  if (!command) return null;
  return { tags, prefix, command, params: params.slice(1) };
}

export type EmoteMap = Map<string, { url: string; provider: "bttv" | "7tv" }>;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type BttvEmote = { id: string; code: string };
type BttvUser = { channelEmotes?: BttvEmote[]; sharedEmotes?: BttvEmote[] };

type SevenTvFile = { name: string; format: string };
type SevenTvHost = { url: string; files: SevenTvFile[] };
type SevenTvEmote = { name: string; data: { host: SevenTvHost } };
type SevenTvSet = { emotes: SevenTvEmote[] };
type SevenTvUser = { emote_set?: SevenTvSet | null };

function pickSevenTvFile(files: SevenTvFile[]): SevenTvFile | undefined {
  // Prefer WEBP, then AVIF, then anything. 2x size when available.
  const sized = (name: string) => /(^|[._-])2x(\.|$)/i.test(name);
  return (
    files.find((f) => f.format === "WEBP" && sized(f.name)) ??
    files.find((f) => f.format === "WEBP") ??
    files.find((f) => f.format === "AVIF" && sized(f.name)) ??
    files.find((f) => f.format === "AVIF") ??
    files[0]
  );
}

/**
 * Loads BTTV + 7TV global + channel emotes for a given Twitch user ID.
 * Channel sets are merged on top of globals so channel-specific overrides
 * win. Codes that already exist as Twitch native emotes will still be
 * displayed by the IRC `emotes` tag, so this only handles the rest.
 */
export async function loadEmoteMap(twitchUserId: string): Promise<EmoteMap> {
  const map: EmoteMap = new Map();

  // Helpers
  const addBttv = (e: BttvEmote) => {
    map.set(e.code, {
      url: `https://cdn.betterttv.net/emote/${e.id}/2x.webp`,
      provider: "bttv",
    });
  };
  const addSevenTv = (e: SevenTvEmote) => {
    const file = pickSevenTvFile(e.data.host.files);
    if (!file) return;
    const host = e.data.host.url.startsWith("http") ? e.data.host.url : `https:${e.data.host.url}`;
    map.set(e.name, { url: `${host}/${file.name}`, provider: "7tv" });
  };

  const [bttvGlobal, bttvChannel, sevenGlobal, sevenChannel] = await Promise.all([
    fetchJson<BttvEmote[]>("https://api.betterttv.net/3/cached/emotes/global"),
    fetchJson<BttvUser>(`https://api.betterttv.net/3/cached/users/twitch/${twitchUserId}`),
    fetchJson<SevenTvSet>("https://7tv.io/v3/emote-sets/global"),
    fetchJson<SevenTvUser>(`https://7tv.io/v3/users/twitch/${twitchUserId}`),
  ]);

  if (bttvGlobal) for (const e of bttvGlobal) addBttv(e);
  if (sevenGlobal?.emotes) for (const e of sevenGlobal.emotes) addSevenTv(e);
  if (bttvChannel) {
    for (const e of bttvChannel.channelEmotes ?? []) addBttv(e);
    for (const e of bttvChannel.sharedEmotes ?? []) addBttv(e);
  }
  if (sevenChannel?.emote_set?.emotes) {
    for (const e of sevenChannel.emote_set.emotes) addSevenTv(e);
  }

  return map;
}

/**
 * Tokenizes a chat message: Twitch emotes come pre-located via the IRC
 * `emotes` tag (UTF-16 codepoint ranges), and we walk the rest of the
 * string slicing in BTTV/7TV emotes by whole-word match.
 */
function tokenize(
  text: string,
  twitchEmotesTag: string | undefined,
  emoteMap: EmoteMap,
): ChatToken[] {
  type Range = { start: number; end: number; token: ChatToken };
  const ranges: Range[] = [];

  if (twitchEmotesTag) {
    // Format: id:start-end,start-end/id2:start-end
    for (const group of twitchEmotesTag.split("/")) {
      if (!group) continue;
      const [id, positions] = group.split(":");
      if (!id || !positions) continue;
      for (const pos of positions.split(",")) {
        const [sStr, eStr] = pos.split("-");
        const s = Number.parseInt(sStr ?? "", 10);
        const e = Number.parseInt(eStr ?? "", 10);
        if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
        const code = text.slice(s, e + 1);
        ranges.push({
          start: s,
          end: e + 1,
          token: {
            kind: "emote",
            code,
            url: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`,
            provider: "twitch",
          },
        });
      }
    }
  }

  // Walk word boundaries for BTTV/7TV.
  ranges.sort((a, b) => a.start - b.start);
  const occupied = (i: number) => ranges.some((r) => i >= r.start && i < r.end);

  const wordRe = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text))) {
    const w = m[0];
    const start = m.index;
    if (occupied(start)) continue;
    const hit = emoteMap.get(w);
    if (hit) {
      ranges.push({
        start,
        end: start + w.length,
        token: { kind: "emote", code: w, url: hit.url, provider: hit.provider },
      });
    }
  }

  ranges.sort((a, b) => a.start - b.start);

  // Stitch text + emote tokens in order.
  const tokens: ChatToken[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) tokens.push({ kind: "text", text: text.slice(cursor, r.start) });
    tokens.push(r.token);
    cursor = r.end;
  }
  if (cursor < text.length) tokens.push({ kind: "text", text: text.slice(cursor) });
  return tokens;
}

function parseBadges(tag: string | undefined): ChatBadge[] {
  if (!tag) return [];
  const out: ChatBadge[] = [];
  for (const b of tag.split(",")) {
    if (!b) continue;
    const [setId, version] = b.split("/");
    if (!setId) continue;
    out.push({ setId, version: version ?? "" });
  }
  return out;
}

export type ChatClientOptions = {
  channel: string;
  emoteMap: EmoteMap;
  onMessage: (msg: ChatMessage) => void;
  onStatus?: (status: "connecting" | "open" | "closed") => void;
};

/**
 * Opens an anonymous Twitch IRC connection and emits a ChatMessage for
 * every PRIVMSG in the joined channel. Returns a disposer.
 */
export function startChatClient(opts: ChatClientOptions): () => void {
  const { channel, emoteMap, onMessage, onStatus } = opts;
  const ch = `#${channel.toLowerCase()}`;
  let ws: WebSocket | null = null;
  let disposed = false;
  let reconnectTimer: number | null = null;
  let attempt = 0;

  const connect = () => {
    if (disposed) return;
    onStatus?.("connecting");
    ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    ws.onopen = () => {
      attempt = 0;
      onStatus?.("open");
      ws?.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws?.send("PASS SCHMOOPIIE");
      ws?.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
      ws?.send(`JOIN ${ch}`);
    };
    ws.onmessage = (ev) => {
      const data = typeof ev.data === "string" ? ev.data : "";
      for (const line of data.split("\r\n")) {
        if (!line) continue;
        if (line.startsWith("PING")) {
          ws?.send(line.replace("PING", "PONG"));
          continue;
        }
        const parsed = parseLine(line);
        if (!parsed) continue;
        if (parsed.command !== "PRIVMSG") continue;
        const [, body = ""] = parsed.params;
        const userMatch = parsed.prefix.match(/^([^!]+)!/);
        const user = userMatch?.[1] ?? "anon";
        const t = parsed.tags;
        const msg: ChatMessage = {
          id: t["id"] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          user,
          displayName: t["display-name"] || user,
          color: t["color"] || undefined,
          badges: parseBadges(t["badges"]),
          tokens: tokenize(body, t["emotes"] || undefined, emoteMap),
          raw: body,
          receivedAt: Date.now(),
        };
        onMessage(msg);
      }
    };
    ws.onclose = () => {
      onStatus?.("closed");
      if (disposed) return;
      attempt++;
      const delay = Math.min(15_000, 500 * 2 ** Math.min(attempt, 5));
      reconnectTimer = window.setTimeout(connect, delay);
    };
    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return () => {
    disposed = true;
    if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
    ws?.close();
  };
}
