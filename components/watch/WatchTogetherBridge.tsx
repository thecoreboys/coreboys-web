"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Check,
  Copy,
  LoaderCircle,
  Radio,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePlayer, type PlayerContextValue } from "@/components/providers/PlayerProvider";
import { useSubscription } from "@/hooks/useSubscription";
import {
  WATCH_PLAYBACK_CONTROL_EVENT,
  WATCH_PLAYBACK_STATE_EVENT,
  type WatchPlaybackControlDetail,
  type WatchPlaybackStateDetail,
} from "@/lib/watch-together/player-events";
import {
  normalizeWatchRoomState,
  parseWatchRoomRealtimeMessage,
  type WatchRoomRealtimeMessage,
  type WatchRoomSignal,
  type WatchRoomSnapshot,
  type WatchRoomState,
} from "@/lib/watch-together/types";

const SESSION_KEY = "core-watch-room:v1";
const HOST_PERSIST_INTERVAL_MS = 2_500;
const SERVER_POLL_INTERVAL_MS = 2_000;

type RoomSession = {
  roomId: string;
  peerId: string;
  role: "host" | "guest";
  inviteCode: string | null;
};

type PeerLink = {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
};

type RoomApiResponse = {
  room?: WatchRoomSnapshot;
  inviteCode?: string;
  error?: string;
  upgradeHref?: string;
};

const EMPTY_PLAYBACK: WatchPlaybackStateDetail = {
  itemKey: null,
  playing: false,
  positionSeconds: 0,
  durationSeconds: 0,
  observedAt: new Date(0).toISOString(),
};

function roomSession(value: unknown): RoomSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<RoomSession>;
  if (
    typeof raw.roomId !== "string"
    || !/^[0-9a-f-]{36}$/i.test(raw.roomId)
    || typeof raw.peerId !== "string"
    || !/^[A-Za-z0-9_-]{16,80}$/.test(raw.peerId)
    || (raw.role !== "host" && raw.role !== "guest")
  ) return null;
  return {
    roomId: raw.roomId,
    peerId: raw.peerId,
    role: raw.role,
    inviteCode: typeof raw.inviteCode === "string" ? raw.inviteCode : null,
  };
}

function createPeerId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function queueFingerprint(state: Pick<WatchRoomState, "queue"> | { queue: PlayerContextValue["queue"] }): string {
  return state.queue.map((item) => item.key).join("\u001f");
}

function stateFingerprint(state: WatchRoomState): string {
  return JSON.stringify({
    current: state.current?.key ?? null,
    queue: state.queue.map((item) => item.key),
    workspace: state.workspace,
    playback: {
      ...state.playback,
      positionSeconds: Math.round(state.playback.positionSeconds),
      observedAt: undefined,
    },
  });
}

function signalDescription(value: unknown): RTCSessionDescriptionInit | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as { type?: unknown; sdp?: unknown };
  if (!(["offer", "answer", "pranswer", "rollback"] as const).includes(raw.type as never)) return null;
  if (raw.type !== "rollback" && typeof raw.sdp !== "string") return null;
  return { type: raw.type as RTCSdpType, sdp: typeof raw.sdp === "string" ? raw.sdp : undefined };
}

function signalCandidate(value: unknown): RTCIceCandidateInit | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as { candidate?: unknown; sdpMid?: unknown; sdpMLineIndex?: unknown; usernameFragment?: unknown };
  if (typeof raw.candidate !== "string") return null;
  return {
    candidate: raw.candidate,
    sdpMid: typeof raw.sdpMid === "string" ? raw.sdpMid : null,
    sdpMLineIndex: typeof raw.sdpMLineIndex === "number" ? raw.sdpMLineIndex : null,
    usernameFragment: typeof raw.usernameFragment === "string" ? raw.usernameFragment : null,
  };
}

function configuredIceServers(): RTCIceServer[] {
  const fallback: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const raw = process.env.NEXT_PUBLIC_WATCH_ROOM_ICE_SERVERS;
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const safe = parsed.flatMap((candidate): RTCIceServer[] => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const value = candidate as { urls?: unknown; username?: unknown; credential?: unknown };
      const urls = typeof value.urls === "string"
        ? [value.urls]
        : Array.isArray(value.urls)
          ? value.urls.filter((url): url is string => typeof url === "string")
          : [];
      if (!urls.length || urls.some((url) => !/^(?:stun|stuns|turn|turns):/i.test(url))) return [];
      return [{
        urls,
        username: typeof value.username === "string" ? value.username : undefined,
        credential: typeof value.credential === "string" ? value.credential : undefined,
      }];
    }).slice(0, 6);
    return safe.length ? safe : fallback;
  } catch {
    return fallback;
  }
}

function localRoomState(
  player: PlayerContextValue,
  playback: WatchPlaybackStateDetail,
  multiview: boolean,
): WatchRoomState {
  return normalizeWatchRoomState({
    current: player.current,
    queue: player.queue,
    workspace: multiview ? player.workspaceSnapshot("Live watch room") : null,
    playback: playback.itemKey === player.current?.key
      ? playback
      : { ...EMPTY_PLAYBACK, itemKey: player.current?.key ?? null, observedAt: new Date().toISOString() },
  });
}

async function roomJson(response: Response): Promise<RoomApiResponse> {
  return response.json().catch(() => ({ error: `room_${response.status}` })) as Promise<RoomApiResponse>;
}

export function WatchTogetherBridge() {
  const pathname = usePathname();
  const player = usePlayer();
  const { user, loading: authLoading } = useAuth();
  const subscription = useSubscription();
  const routeEligible = pathname.startsWith("/theater") || pathname.startsWith("/multiview");
  const multiview = pathname.startsWith("/multiview");
  const [panelOpen, setPanelOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [roomTitle, setRoomTitle] = useState("My CORE room");
  const [session, setSession] = useState<RoomSession | null>(null);
  const [room, setRoom] = useState<WatchRoomSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [directPeers, setDirectPeers] = useState(0);
  const [playback, setPlayback] = useState<WatchPlaybackStateDetail>(EMPTY_PLAYBACK);
  const sessionRef = useRef<RoomSession | null>(null);
  const roomRef = useRef<WatchRoomSnapshot | null>(null);
  const playerRef = useRef(player);
  const playbackRef = useRef(playback);
  const linksRef = useRef(new Map<string, PeerLink>());
  const latestSignalIdRef = useRef(0);
  const latestHostStateRef = useRef<WatchRoomState | null>(null);
  const lastBroadcastFingerprintRef = useRef("");
  const lastPersistedFingerprintRef = useRef("");
  const lastAppliedQueueFingerprintRef = useRef("");
  const hostPersistTimerRef = useRef<number | null>(null);
  const guestReadyRef = useRef(false);
  const realtimeHandlerRef = useRef<(message: WatchRoomRealtimeMessage, peerId: string) => void>(() => {});
  const iceServers = useMemo(configuredIceServers, []);

  sessionRef.current = session;
  roomRef.current = room;
  playerRef.current = player;
  playbackRef.current = playback;

  const syncDirectPeerCount = useCallback(() => {
    setDirectPeers(Array.from(linksRef.current.values()).filter((link) => link.channel?.readyState === "open").length);
  }, []);

  const closePeer = useCallback((peerId: string) => {
    const link = linksRef.current.get(peerId);
    if (!link) return;
    link.channel?.close();
    link.pc.close();
    linksRef.current.delete(peerId);
    syncDirectPeerCount();
  }, [syncDirectPeerCount]);

  const closeAllPeers = useCallback(() => {
    for (const peerId of linksRef.current.keys()) closePeer(peerId);
  }, [closePeer]);

  const sendSignal = useCallback(async (
    targetPeerId: string | null,
    kind: "offer" | "answer" | "ice" | "bye",
    payload: unknown,
  ) => {
    const active = sessionRef.current;
    if (!active) return false;
    const response = await fetch(`/api/watch/rooms/${encodeURIComponent(active.roomId)}/signal`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ peerId: active.peerId, targetPeerId, kind, payload }),
    }).catch(() => null);
    return Boolean(response?.ok);
  }, []);

  const attachChannel = useCallback((peerId: string, channel: RTCDataChannel) => {
    const link = linksRef.current.get(peerId);
    if (!link) return;
    link.channel = channel;
    channel.onopen = () => {
      syncDirectPeerCount();
      const active = sessionRef.current;
      const state = latestHostStateRef.current;
      if (active?.role === "host" && state) {
        channel.send(JSON.stringify({ type: "state", version: roomRef.current?.version ?? 0, state }));
      } else {
        channel.send(JSON.stringify({ type: "request-state" }));
      }
    };
    channel.onclose = syncDirectPeerCount;
    channel.onerror = syncDirectPeerCount;
    channel.onmessage = (event) => {
      if (typeof event.data !== "string" || event.data.length > 200_000) return;
      try {
        const message = parseWatchRoomRealtimeMessage(JSON.parse(event.data));
        if (message) realtimeHandlerRef.current(message, peerId);
      } catch {
        // Malformed peer payloads are ignored without affecting the room.
      }
    };
  }, [syncDirectPeerCount]);

  const createPeer = useCallback((peerId: string, makeChannel: boolean): PeerLink | null => {
    if (typeof RTCPeerConnection === "undefined") return null;
    closePeer(peerId);
    const pc = new RTCPeerConnection({ iceServers });
    const link: PeerLink = { pc, channel: null };
    linksRef.current.set(peerId, link);
    pc.onicecandidate = (event) => {
      if (event.candidate) void sendSignal(peerId, "ice", event.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer(peerId);
      else syncDirectPeerCount();
    };
    pc.ondatachannel = (event) => attachChannel(peerId, event.channel);
    if (makeChannel) attachChannel(peerId, pc.createDataChannel("core-room-sync", { ordered: true }));
    return link;
  }, [attachChannel, closePeer, iceServers, sendSignal, syncDirectPeerCount]);

  const sendRealtime = useCallback((message: WatchRoomRealtimeMessage, peerId?: string): boolean => {
    const serialized = JSON.stringify(message);
    let sent = false;
    for (const [remotePeerId, link] of linksRef.current) {
      if (peerId && remotePeerId !== peerId) continue;
      if (link.channel?.readyState !== "open") continue;
      link.channel.send(serialized);
      sent = true;
    }
    return sent;
  }, []);

  const applyRemoteState = useCallback((state: WatchRoomState) => {
    const activePlayer = playerRef.current;
    const normalized = normalizeWatchRoomState(state);
    guestReadyRef.current = false;
    lastAppliedQueueFingerprintRef.current = queueFingerprint(normalized);
    if (normalized.current && normalized.current.key !== activePlayer.current?.key) {
      activePlayer.play(normalized.current, [], { mode: "theater" });
    }
    activePlayer.replaceQueue(normalized.queue);
    if (pathname.startsWith("/multiview") && normalized.workspace) {
      activePlayer.applyWorkspaceLayout(normalized.workspace, { preserveMaximized: true });
    }

    const applyPlayback = () => {
      const latest = playbackRef.current;
      if (!normalized.current || latest.itemKey !== normalized.current.key) return;
      const observed = Date.parse(normalized.playback.observedAt);
      const elapsed = normalized.playback.playing && Number.isFinite(observed)
        ? Math.max(0, (Date.now() - observed) / 1_000)
        : 0;
      const target = Math.max(0, normalized.playback.positionSeconds + elapsed);
      const canSeek = normalized.current.kind !== "live" || normalized.current.dvr?.enabled === true;
      if (canSeek && Math.abs(latest.positionSeconds - target) > 2.5) {
        const detail: WatchPlaybackControlDetail = {
          itemKey: normalized.current.key,
          action: "seek",
          positionSeconds: target,
        };
        window.dispatchEvent(new CustomEvent(WATCH_PLAYBACK_CONTROL_EVENT, { detail }));
      }
      if (latest.playing !== normalized.playback.playing) {
        const detail: WatchPlaybackControlDetail = {
          itemKey: normalized.current.key,
          action: normalized.playback.playing ? "play" : "pause",
        };
        window.dispatchEvent(new CustomEvent(WATCH_PLAYBACK_CONTROL_EVENT, { detail }));
      }
      guestReadyRef.current = true;
    };
    window.setTimeout(applyPlayback, normalized.current?.key === activePlayer.current?.key ? 0 : 180);
  }, [pathname]);

  const applyHostQueue = useCallback((state: WatchRoomState) => {
    const normalized = normalizeWatchRoomState(state);
    const fingerprint = queueFingerprint(normalized);
    if (fingerprint === queueFingerprint({ queue: playerRef.current.queue })) return;
    lastAppliedQueueFingerprintRef.current = fingerprint;
    playerRef.current.replaceQueue(normalized.queue);
  }, []);

  realtimeHandlerRef.current = (message, peerId) => {
    const active = sessionRef.current;
    if (!active) return;
    if (message.type === "request-state" && active.role === "host" && latestHostStateRef.current) {
      sendRealtime({ type: "state", version: roomRef.current?.version ?? 0, state: latestHostStateRef.current }, peerId);
      return;
    }
    if (message.type === "state" && active.role === "guest") {
      applyRemoteState(message.state);
      return;
    }
    if (message.type === "queue-proposal" && active.role === "host") {
      applyHostQueue(normalizeWatchRoomState({ ...latestHostStateRef.current, queue: message.queue }));
    }
  };

  const acceptSnapshot = useCallback((snapshot: WatchRoomSnapshot) => {
    const active = sessionRef.current;
    if (!active) return;
    roomRef.current = snapshot;
    setRoom(snapshot);
    if (snapshot.signals.length) {
      latestSignalIdRef.current = Math.max(latestSignalIdRef.current, ...snapshot.signals.map((signal) => signal.id));
    }
    if (active.role === "guest") applyRemoteState(snapshot.state);
    else applyHostQueue(snapshot.state);
  }, [applyHostQueue, applyRemoteState]);

  const fetchSnapshot = useCallback(async () => {
    const active = sessionRef.current;
    if (!active) return null;
    const response = await fetch(
      `/api/watch/rooms/${encodeURIComponent(active.roomId)}?peerId=${encodeURIComponent(active.peerId)}&afterSignalId=${latestSignalIdRef.current}`,
      { credentials: "same-origin", cache: "no-store" },
    ).catch(() => null);
    if (!response) return null;
    const body = await roomJson(response);
    if (!response.ok || !body.room) {
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        sessionStorage.removeItem(SESSION_KEY);
        closeAllPeers();
        setSession(null);
        setRoom(null);
      }
      return null;
    }
    acceptSnapshot(body.room);
    return body.room;
  }, [acceptSnapshot, closeAllPeers]);

  const processSignal = useCallback(async (signal: WatchRoomSignal) => {
    const active = sessionRef.current;
    if (!active || signal.senderPeerId === active.peerId) return;
    if (signal.kind === "bye") {
      closePeer(signal.senderPeerId);
      return;
    }
    if (signal.kind === "offer") {
      if (active.role !== "guest") return;
      const description = signalDescription(signal.payload);
      if (!description || description.type !== "offer") return;
      const link = createPeer(signal.senderPeerId, false);
      if (!link) return;
      await link.pc.setRemoteDescription(description);
      const answer = await link.pc.createAnswer();
      await link.pc.setLocalDescription(answer);
      await sendSignal(signal.senderPeerId, "answer", answer);
      return;
    }
    const link = linksRef.current.get(signal.senderPeerId);
    if (!link) return;
    if (signal.kind === "answer") {
      if (active.role !== "host") return;
      const description = signalDescription(signal.payload);
      if (description?.type === "answer") await link.pc.setRemoteDescription(description);
      return;
    }
    const candidate = signalCandidate(signal.payload);
    if (candidate) await link.pc.addIceCandidate(candidate).catch(() => undefined);
  }, [closePeer, createPeer, sendSignal]);

  useEffect(() => {
    if (!routeEligible || authLoading || !user || sessionRef.current) return;
    try {
      const restored = roomSession(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null"));
      if (restored) setSession(restored);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [authLoading, routeEligible, user]);

  useEffect(() => {
    sessionRef.current = session;
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
    latestSignalIdRef.current = 0;
    guestReadyRef.current = false;
    if (!session) closeAllPeers();
  }, [closeAllPeers, session]);

  useEffect(() => {
    const onPlayback = (event: Event) => {
      const detail = (event as CustomEvent<WatchPlaybackStateDetail>).detail;
      if (!detail || typeof detail.observedAt !== "string") return;
      setPlayback(detail);
    };
    window.addEventListener(WATCH_PLAYBACK_STATE_EVENT, onPlayback);
    return () => window.removeEventListener(WATCH_PLAYBACK_STATE_EVENT, onPlayback);
  }, []);

  useEffect(() => {
    if (!session || !routeEligible) return;
    let cancelled = false;
    const poll = async () => {
      const snapshot = await fetchSnapshot();
      if (cancelled || !snapshot) return;
      for (const signal of snapshot.signals) {
        await processSignal(signal).catch(() => undefined);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), SERVER_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fetchSnapshot, processSignal, routeEligible, session]);

  useEffect(() => {
    if (!session || session.role !== "host" || !room) return;
    const activeGuests = new Set(
      room.members.filter((member) => member.role === "guest").map((member) => member.peerId),
    );
    for (const peerId of linksRef.current.keys()) {
      if (!activeGuests.has(peerId)) closePeer(peerId);
    }
    for (const peerId of activeGuests) {
      if (linksRef.current.has(peerId)) continue;
      const link = createPeer(peerId, true);
      if (!link) continue;
      void (async () => {
        const offer = await link.pc.createOffer();
        await link.pc.setLocalDescription(offer);
        await sendSignal(peerId, "offer", offer);
      })().catch(() => closePeer(peerId));
    }
  }, [closePeer, createPeer, room, sendSignal, session]);

  const persistState = useCallback(async (scope: "host" | "queue", state: WatchRoomState) => {
    const active = sessionRef.current;
    const currentRoom = roomRef.current;
    if (!active || !currentRoom) return false;
    const response = await fetch(`/api/watch/rooms/${encodeURIComponent(active.roomId)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        peerId: active.peerId,
        baseVersion: currentRoom.version,
        scope,
        state,
      }),
    }).catch(() => null);
    if (!response) return false;
    const body = await roomJson(response);
    if (response.ok && body.room) {
      roomRef.current = body.room;
      setRoom(body.room);
      return true;
    }
    if (response.status === 409) void fetchSnapshot();
    return false;
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!session || session.role !== "host" || !room) return;
    const state = localRoomState(player, playback, multiview);
    const fingerprint = stateFingerprint(state);
    latestHostStateRef.current = state;
    if (fingerprint !== lastBroadcastFingerprintRef.current) {
      lastBroadcastFingerprintRef.current = fingerprint;
      sendRealtime({ type: "state", version: room.version, state });
    }
    if (fingerprint === lastPersistedFingerprintRef.current || hostPersistTimerRef.current !== null) return;
    hostPersistTimerRef.current = window.setTimeout(() => {
      hostPersistTimerRef.current = null;
      const latest = latestHostStateRef.current;
      if (!latest) return;
      const latestFingerprint = stateFingerprint(latest);
      void persistState("host", latest).then((saved) => {
        if (saved) lastPersistedFingerprintRef.current = latestFingerprint;
      });
    }, HOST_PERSIST_INTERVAL_MS);
  }, [multiview, persistState, playback, player, room, sendRealtime, session]);

  useEffect(() => () => {
    if (hostPersistTimerRef.current !== null) window.clearTimeout(hostPersistTimerRef.current);
  }, []);

  useEffect(() => {
    if (!session || session.role !== "guest" || !room || !guestReadyRef.current) return;
    const fingerprint = queueFingerprint({ queue: player.queue });
    if (fingerprint === lastAppliedQueueFingerprintRef.current) return;
    const state = normalizeWatchRoomState({ ...room.state, queue: player.queue });
    const sentDirect = sendRealtime({ type: "queue-proposal", queue: state.queue }, room.hostPeerId ?? undefined);
    if (sentDirect) {
      lastAppliedQueueFingerprintRef.current = fingerprint;
    } else {
      void persistState("queue", state).then((saved) => {
        if (saved) lastAppliedQueueFingerprintRef.current = fingerprint;
      });
    }
  }, [persistState, player.queue, room, sendRealtime, session]);

  useEffect(() => () => closeAllPeers(), [closeAllPeers]);

  const createRoom = useCallback(async () => {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    const peerId = createPeerId();
    const state = localRoomState(playerRef.current, playbackRef.current, multiview);
    const response = await fetch("/api/watch/rooms", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ peerId, title: roomTitle.trim() || "My CORE room", state }),
    }).catch(() => null);
    if (!response) {
      setError("Could not reach the room service.");
      setBusy(false);
      return;
    }
    const body = await roomJson(response);
    if (!response.ok || !body.room) {
      setError(body.error === "plan_required" ? "CORE Membership is required to host a private room." : "The room could not be created.");
      setBusy(false);
      return;
    }
    const next: RoomSession = { roomId: body.room.id, peerId, role: "host", inviteCode: body.inviteCode ?? null };
    roomRef.current = body.room;
    setRoom(body.room);
    setSession(next);
    setPanelOpen(true);
    setBusy(false);
  }, [busy, multiview, roomTitle, user]);

  const joinRoom = useCallback(async () => {
    if (!user || busy || !joinCode.trim()) return;
    setBusy(true);
    setError(null);
    const peerId = createPeerId();
    const response = await fetch("/api/watch/rooms/join", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ peerId, inviteCode: joinCode }),
    }).catch(() => null);
    if (!response) {
      setError("Could not reach the room service.");
      setBusy(false);
      return;
    }
    const body = await roomJson(response);
    if (!response.ok || !body.room) {
      setError(body.error === "room_full" ? "That room is full." : "That invite is invalid or expired.");
      setBusy(false);
      return;
    }
    const next: RoomSession = { roomId: body.room.id, peerId, role: body.room.role, inviteCode: null };
    roomRef.current = body.room;
    setRoom(body.room);
    setSession(next);
    setJoinCode("");
    setPanelOpen(true);
    setBusy(false);
  }, [busy, joinCode, user]);

  const leaveRoom = useCallback(async (close: boolean) => {
    const active = sessionRef.current;
    if (!active || busy) return;
    setBusy(true);
    for (const peerId of linksRef.current.keys()) void sendSignal(peerId, "bye", {});
    await fetch(`/api/watch/rooms/${encodeURIComponent(active.roomId)}`, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ peerId: active.peerId, close }),
    }).catch(() => null);
    closeAllPeers();
    setSession(null);
    setRoom(null);
    setBusy(false);
  }, [busy, closeAllPeers, sendSignal]);

  const copyInvite = useCallback(async () => {
    if (!session?.inviteCode) return;
    await navigator.clipboard.writeText(session.inviteCode).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  }, [session?.inviteCode]);

  if (!routeEligible) return null;

  const signedIn = Boolean(user);
  const canHost = subscription.hasFeature("rooms.private");
  const memberCount = room?.members.length ?? (session ? 1 : 0);
  const connectionLabel = !session
    ? "Private rooms"
    : memberCount <= 1
      ? "Waiting for guests"
      : directPeers > 0
        ? `WebRTC direct · ${directPeers}`
        : "Secure server sync";

  return (
    <aside className="watch-together" data-open={panelOpen ? "true" : "false"} aria-label="Watch together">
      {!panelOpen ? (
        <button
          type="button"
          className="watch-together__trigger"
          onClick={() => setPanelOpen(true)}
          aria-expanded={false}
        >
          <span className="watch-together__signal"><Radio aria-hidden /></span>
          <span><strong>{session ? room?.title ?? "Watch room" : "Watch together"}</strong><small>{connectionLabel}</small></span>
          {session ? <b>{memberCount}</b> : null}
        </button>
      ) : (
        <section className="watch-together__panel" aria-live="polite">
          <header>
            <span><ShieldCheck aria-hidden /><b>{session ? "Private watch room" : "Watch together"}</b></span>
            <button type="button" onClick={() => setPanelOpen(false)} aria-label="Close watch together"><X aria-hidden /></button>
          </header>

          {!signedIn && !authLoading ? (
            <div className="watch-together__empty">
              <UsersRound aria-hidden />
              <strong>Sign in to join a room</strong>
              <p>Invited guests can join free. CORE members can host and share a private room.</p>
              <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</Link>
            </div>
          ) : null}

          {signedIn && !session ? (
            <div className="watch-together__setup">
              <div className="watch-together__join">
                <label htmlFor="watch-room-code">Join with an invite</label>
                <div><input id="watch-room-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ABCDE-FGHIJ" maxLength={16} /><button type="button" onClick={() => void joinRoom()} disabled={busy || joinCode.trim().length < 8}>Join</button></div>
                <small>Joining is free for every signed-in viewer.</small>
              </div>
              <div className="watch-together__divider"><span>or host</span></div>
              {canHost ? (
                <div className="watch-together__host">
                  <label htmlFor="watch-room-title">Room name</label>
                  <input id="watch-room-title" value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} maxLength={80} />
                  <button type="button" onClick={() => void createRoom()} disabled={busy}>{busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Radio aria-hidden />} Start private room</button>
                </div>
              ) : (
                <a className="watch-together__upgrade" href={subscription.featureHref("rooms.private")}><strong>Host with CORE Membership</strong><small>Private rooms, shared playback, queues, and layouts.</small></a>
              )}
            </div>
          ) : null}

          {signedIn && session && !room ? (
            <div className="watch-together__empty">
              <LoaderCircle className="animate-spin" aria-hidden />
              <strong>Rejoining your room</strong>
              <p>Restoring the private session and its latest shared playback state.</p>
            </div>
          ) : null}

          {session && room ? (
            <div className="watch-together__active">
              <div className="watch-together__status"><span data-direct={directPeers > 0 ? "true" : "false"}><i />{connectionLabel}</span><span><UsersRound aria-hidden />{memberCount} / 12</span></div>
              {session.role === "host" && session.inviteCode ? (
                <div className="watch-together__invite"><span><small>Invite code</small><strong>{session.inviteCode}</strong></span><button type="button" onClick={() => void copyInvite()}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />}{copied ? "Copied" : "Copy"}</button></div>
              ) : null}
              <div className="watch-together__members">
                {room.members.map((member) => <span key={member.peerId}><i />{member.displayName}<small>{member.role}</small></span>)}
              </div>
              <p>Playback, the Up Next queue, and {multiview ? "the complete multiview layout" : "the Theater selection"} stay synchronized. Direct WebRTC is used when available; secure polling keeps the room moving otherwise.</p>
              <button className="watch-together__leave" type="button" onClick={() => void leaveRoom(session.role === "host")} disabled={busy}>{session.role === "host" ? "End room for everyone" : "Leave room"}</button>
            </div>
          ) : null}

          {error ? <p className="watch-together__error">{error}</p> : null}
        </section>
      )}
    </aside>
  );
}
