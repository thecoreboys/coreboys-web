"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PostcardDraftSchema,
  createPostcardDraft,
  restorePostcardDraft,
  serializePostcardDraft,
  type CreatePostcardDraftOptions,
  type PostcardDraft,
} from "@/lib/postcard-draft";
import {
  readPostcardDraftRecord,
  writePostcardDraftRecord,
} from "@/lib/postcard-draft-storage";

const ACTIVE_DRAFT_KEY = "coreboys:postcard:draft:v1";
const NAMED_DRAFTS_KEY = "coreboys:postcard:named-drafts:v1";
const FAVORITE_REMIXES_KEY = "coreboys:postcard:favorite-remixes:v1";
const HISTORY_LIMIT = 80;

export type NamedPostcardDraft = {
  id: string;
  name: string;
  savedAt: string;
  draft: PostcardDraft;
};

type DraftUpdater = PostcardDraft | ((current: PostcardDraft) => PostcardDraft);

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): boolean {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function revised(draft: PostcardDraft): PostcardDraft {
  return PostcardDraftSchema.parse({
    ...draft,
    revision: draft.revision + 1,
    updatedAt: new Date().toISOString(),
  });
}

function shareSafeDraft(draft: PostcardDraft): PostcardDraft {
  return PostcardDraftSchema.parse({
    ...draft,
    photoSlots: draft.photoSlots.map((slot) => ({
      ...slot,
      // Uploaded/camera/clipboard art is private and can be very large. A
      // proof link shares the composition, never those local image bytes.
      asset: slot.asset?.source.kind === "embedded" ? null : slot.asset,
    })),
    writing: {
      ...draft.writing,
      senderName: draft.writing.senderVisibility === "anonymous" ? "" : draft.writing.senderName,
      signatureAssetId: null,
      signatureDataUrl: null,
    },
  });
}

function containsLocalBinary(draft: PostcardDraft): boolean {
  return draft.photoSlots.some((slot) => slot.asset?.source.kind === "embedded")
    || Boolean(draft.writing.signatureDataUrl);
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function decodePostcardProofToken(token: string): unknown | null {
  if (!token || token.length > 16_000 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const padded = token.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

export function usePostcardDraftEditor(options: CreatePostcardDraftOptions) {
  const [draft, setDraftState] = useState<PostcardDraft>(() => createPostcardDraft(options));
  const [namedDrafts, setNamedDrafts] = useState<NamedPostcardDraft[]>([]);
  const [favoriteRemixes, setFavoriteRemixes] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const pastRef = useRef<PostcardDraft[]>([]);
  const futureRef = useRef<PostcardDraft[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = new URL(globalThis.location.href);
      const proofParameters = new URLSearchParams(url.hash.replace(/^#/, ""));
      const proof = decodePostcardProofToken(
        proofParameters.get("proof") ?? url.searchParams.get("proof") ?? "",
      );
      const local = safeRead<unknown>(ACTIVE_DRAFT_KEY, null);
      const durable = proof ? null : await readPostcardDraftRecord<unknown>(ACTIVE_DRAFT_KEY).catch(() => null);
      const restoredDraft = restorePostcardDraft(proof ?? durable ?? local, options);
      const localNamed = safeRead<NamedPostcardDraft[]>(NAMED_DRAFTS_KEY, []);
      const durableNamed = await readPostcardDraftRecord<NamedPostcardDraft[]>(NAMED_DRAFTS_KEY).catch(() => null);
      const storedNamed = durableNamed ?? localNamed;
      if (cancelled) return;
      setDraftState(restoredDraft.draft);
      setNamedDrafts(storedNamed.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const result = restorePostcardDraft(entry.draft, options);
        return [{
          id: typeof entry.id === "string" ? entry.id : result.draft.id,
          name: typeof entry.name === "string" ? entry.name.slice(0, 80) : "Saved postcard",
          savedAt: typeof entry.savedAt === "string" ? entry.savedAt : result.draft.updatedAt,
          draft: result.draft,
        }];
      }).slice(0, 20));
      setFavoriteRemixes(
        safeRead<unknown[]>(FAVORITE_REMIXES_KEY, [])
          .filter((value): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value))
          .slice(0, 30),
      );
      setRestored(true);
      setDraftSaveStatus("saved");
    })();
    return () => { cancelled = true; };
  // Initial restore is intentionally one-shot; later option changes are edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    let cancelled = false;
    setDraftSaveStatus("saving");
    const timer = globalThis.setTimeout(() => {
      void writePostcardDraftRecord(ACTIVE_DRAFT_KEY, draft).then(() => {
        // Keep a lightweight fallback for browsers that later disable IndexedDB.
        safeWrite(ACTIVE_DRAFT_KEY, shareSafeDraft(draft));
        if (!cancelled) setDraftSaveStatus("saved");
      }).catch(() => {
        const fallbackSaved = safeWrite(ACTIVE_DRAFT_KEY, shareSafeDraft(draft));
        if (!cancelled) setDraftSaveStatus(fallbackSaved && !containsLocalBinary(draft) ? "saved" : "error");
      });
    }, 250);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [draft, restored]);

  const commit = useCallback((updater: DraftUpdater) => {
    setDraftState((current) => {
      const candidate = typeof updater === "function" ? updater(current) : updater;
      if (serializePostcardDraft(candidate) === serializePostcardDraft(current)) return current;
      const next = candidate.revision === current.revision && candidate.updatedAt === current.updatedAt
        ? revised(candidate)
        : PostcardDraftSchema.parse(candidate);
      pastRef.current = [...pastRef.current.slice(-(HISTORY_LIMIT - 1)), current];
      futureRef.current = [];
      return next;
    });
  }, []);

  const replace = useCallback((next: PostcardDraft, recordHistory = true) => {
    const valid = PostcardDraftSchema.parse(next);
    setDraftState((current) => {
      if (recordHistory) pastRef.current = [...pastRef.current.slice(-(HISTORY_LIMIT - 1)), current];
      futureRef.current = [];
      return valid;
    });
  }, []);

  const undo = useCallback(() => {
    const previous = pastRef.current.at(-1);
    if (!previous) return;
    setDraftState((current) => {
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [current, ...futureRef.current].slice(0, HISTORY_LIMIT);
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current[0];
    if (!next) return;
    setDraftState((current) => {
      futureRef.current = futureRef.current.slice(1);
      pastRef.current = [...pastRef.current.slice(-(HISTORY_LIMIT - 1)), current];
      return next;
    });
  }, []);

  const reset = useCallback((nextOptions: CreatePostcardDraftOptions = options) => {
    replace(createPostcardDraft(nextOptions));
  }, [options, replace]);

  const saveNamedDraft = useCallback(async (name: string): Promise<boolean> => {
    const trimmed = name.trim().slice(0, 80) || "Saved postcard";
    const entry = { id: draft.id, name: trimmed, savedAt: new Date().toISOString(), draft };
    const next = [entry, ...namedDrafts.filter((item) => item.id !== draft.id)].slice(0, 20);
    try {
      await writePostcardDraftRecord(NAMED_DRAFTS_KEY, next);
      safeWrite(NAMED_DRAFTS_KEY, next.map((item) => ({ ...item, draft: shareSafeDraft(item.draft) })));
      setNamedDrafts(next);
      return true;
    } catch {
      if (next.some((item) => containsLocalBinary(item.draft))) return false;
      const fallback = next.map((item) => ({ ...item, draft: shareSafeDraft(item.draft) }));
      if (!safeWrite(NAMED_DRAFTS_KEY, fallback)) return false;
      setNamedDrafts(fallback);
      return true;
    }
  }, [draft, namedDrafts]);

  const loadNamedDraft = useCallback((id: string) => {
    const found = namedDrafts.find((entry) => entry.id === id);
    if (found) replace(found.draft);
  }, [namedDrafts, replace]);

  const removeNamedDraft = useCallback((id: string) => {
    setNamedDrafts((current) => {
      const next = current.filter((entry) => entry.id !== id);
      void writePostcardDraftRecord(NAMED_DRAFTS_KEY, next).catch(() => undefined);
      safeWrite(NAMED_DRAFTS_KEY, next.map((item) => ({ ...item, draft: shareSafeDraft(item.draft) })));
      return next;
    });
  }, []);

  const toggleFavoriteRemix = useCallback((seed: string) => {
    setFavoriteRemixes((current) => {
      const next = current.includes(seed)
        ? current.filter((value) => value !== seed)
        : [seed, ...current].slice(0, 30);
      safeWrite(FAVORITE_REMIXES_KEY, next);
      return next;
    });
  }, []);

  const proofToken = useMemo(
    () => toBase64Url(serializePostcardDraft(shareSafeDraft(draft))),
    [draft],
  );

  return {
    draft,
    restored,
    draftSaveStatus,
    commit,
    replace,
    reset,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    namedDrafts,
    saveNamedDraft,
    loadNamedDraft,
    removeNamedDraft,
    favoriteRemixes,
    toggleFavoriteRemix,
    proofToken,
  };
}
