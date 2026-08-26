"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/components/providers/AuthProvider";
import { findUnlockedPassportCosmetic } from "@/components/passport/passport-utils";
import type {
  PassportActionRequest,
  PassportActionResponse,
  PassportDashboard,
  PassportLoadout,
  PassportPrivacy,
} from "@/lib/passport/types";

export type PassportMutationState = {
  pendingAction: PassportActionRequest["action"] | null;
  error: string | null;
  notice: string | null;
};

function makeIdempotencyKey(prefix: string) {
  try {
    return `${prefix}:${crypto.randomUUID()}`;
  } catch {
    return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
  }
}

function stableIdempotencyKey(prefix: string, scope: string) {
  const storageKey = `core-passport-idempotency:${prefix}:${scope}`;
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const created = makeIdempotencyKey(prefix);
    localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return makeIdempotencyKey(prefix);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string; message?: string; detail?: unknown; details?: unknown })
    | null;
  if (!response.ok) {
    const detail = typeof payload?.details === "string"
      ? payload.details
      : typeof payload?.detail === "string"
        ? payload.detail
        : null;
    const rawMessage = detail ?? payload?.message ?? payload?.error;
    const message = rawMessage === "event_requires_independent_certification"
      ? "An independent operator must certify this event before permanent rewards can be claimed."
      : rawMessage;
    throw new Error(message ?? "Passport could not be updated.");
  }
  if (!payload) throw new Error("Passport returned an empty response.");
  return payload;
}

async function getPassport(url: string): Promise<PassportDashboard> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  return readJson<PassportDashboard>(response);
}

export function usePassport(enabled = true) {
  const { data, error: loadError, isLoading, mutate } = useSWR<PassportDashboard>(
    enabled ? "/api/account/passport" : null,
    getPassport,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const [mutation, setMutation] = useState<PassportMutationState>({
    pendingAction: null,
    error: null,
    notice: null,
  });

  const run = useCallback(
    async (request: PassportActionRequest, notice: string) => {
      setMutation({ pendingAction: request.action, error: null, notice: null });
      try {
        const response = await fetch("/api/account/passport/action", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        });
        const result = await readJson<PassportActionResponse>(response);
        if (result.dashboard) await mutate(result.dashboard, { revalidate: false });
        else await mutate();
        setMutation({ pendingAction: null, error: null, notice });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Passport could not be updated.";
        setMutation({ pendingAction: null, error: message, notice: null });
        throw error;
      }
    },
    [mutate],
  );

  const clearStatus = useCallback(() => {
    setMutation({ pendingAction: null, error: null, notice: null });
  }, []);
  const refresh = useCallback(() => mutate(), [mutate]);

  return {
    passport: data ?? null,
    loading: isLoading,
    loadError: loadError instanceof Error ? loadError.message : loadError ? "Passport could not be loaded." : null,
    mutation,
    refresh,
    clearStatus,
    action: run,
    claimPresence: (eventId: string, editionId?: string) => run({ action: "presence.claim", payload: { eventId, editionId, idempotencyKey: stableIdempotencyKey("presence", eventId) } }, "Attendance and Moment Cards claimed."),
    claimQuest: (questCode: string) => run({ action: "quest.claim", payload: { questCode, idempotencyKey: makeIdempotencyKey("quest") } }, "Quest reward claimed."),
    claimCommunityGoal: (goalCode: string) => run({ action: "community_goal.claim", payload: { goalCode, idempotencyKey: makeIdempotencyKey("community-goal") } } as PassportActionRequest, "Community goal reward claimed."),
    saveShowcase: (cardIds: string[], achievementCodes: string[]) => run({ action: "showcase.save", payload: { cardIds, achievementCodes } }, "Showcase saved."),
    saveLoadout: (loadout: Omit<PassportLoadout, "updatedAt">) => run({ action: "loadout.save", payload: loadout }, "Channel identity saved."),
    activateLoadout: (scope: string) => run({ action: "loadout.activate", payload: { scope } }, "Identity loadout activated."),
    savePrivacy: (privacy: PassportPrivacy) => run({ action: "privacy.save", payload: privacy }, "Privacy choices saved."),
    updateProfile: (payload: { displayTitle?: string | null; exchangeEnabled?: boolean; privacy?: PassportPrivacy; cardIds?: string[]; achievementCodes?: string[] }) => run({ action: "profile.update", payload }, "Passport profile saved."),
    claimAlbum: (albumCode: string) => run({ action: "album.claim", payload: { albumCode, idempotencyKey: makeIdempotencyKey("album") } }, "Album completion reward claimed."),
    craftDuplicates: (cardIds: string[], recipeCode = "three-common-to-sparks") => run({ action: "card.craft", payload: { recipeCode, cardIds, idempotencyKey: makeIdempotencyKey("craft") } }, "Three duplicates crafted into Sparks."),
    sendGift: (cardId: string, recipient: string, message?: string) => run({ action: "gift.create", payload: { cardId, recipient, message, idempotencyKey: makeIdempotencyKey("gift") } }, "Gift invitation sent."),
    respondGift: (giftId: string, response: "accept" | "decline" | "cancel") => run({ action: `gift.${response}`, payload: { giftId, idempotencyKey: makeIdempotencyKey("gift-response") } } as PassportActionRequest, response === "accept" ? "Gift accepted." : "Gift request closed."),
    createTrade: (recipient: string, offeredCardIds: string[], requestedCardIds: string[], message?: string) => run({ action: "trade.create", payload: { recipient, offeredCardIds, requestedCardIds, message, idempotencyKey: makeIdempotencyKey("trade") } }, "Trade proposal sent."),
    respondTrade: (tradeId: string, response: "accept" | "confirm" | "decline" | "cancel") => run({ action: `trade.${response}`, payload: { tradeId, idempotencyKey: makeIdempotencyKey("trade-response") } } as PassportActionRequest, response === "accept" ? "Trade accepted. Both sides must still confirm." : response === "confirm" ? "Your final confirmation was recorded." : "Trade request closed."),
  };
}

export function passportScope(channelSlug?: string | null) {
  return channelSlug ? `channel:${channelSlug}` : "global";
}

/** A small, stable identity snapshot for chat, profiles, and channel headers. */
export function usePassportIdentity(channelSlug?: string | null) {
  const auth = useAuth();
  const { passport, loading, loadError } = usePassport(!auth.loading && Boolean(auth.user));
  return useMemo(() => {
    const requestedScope = channelSlug
      ? passportScope(channelSlug)
      : passport?.profile.activeLoadoutScope || "global";
    const loadout =
      passport?.loadouts.find((candidate) => candidate.scope === requestedScope) ??
      passport?.loadouts.find((candidate) => candidate.scope === "global") ??
      null;
    const cosmetic = (code: string | null) =>
      findUnlockedPassportCosmetic(passport?.cosmeticCatalog ?? [], code);
    return {
      loading: auth.loading || loading,
      error: loadError,
      signedIn: Boolean(auth.user && passport),
      scope: requestedScope,
      title: cosmetic(loadout?.titleCode ?? null),
      nameplate: cosmetic(loadout?.nameplateCode ?? null),
      frame: cosmetic(loadout?.frameCode ?? null),
      theme: cosmetic(loadout?.themeCode ?? null),
      featuredCard: loadout?.featuredCardId
        ? passport?.cards.find((card) => card.id === loadout.featuredCardId) ?? null
        : null,
      badges: (loadout?.badgeCodes ?? [])
        .map((code) => passport?.achievements.find((achievement) => achievement.code === code) ?? null)
        .filter((achievement) => achievement !== null),
      reactionCodes: loadout?.reactionCodes ?? [],
      raw: loadout,
    };
  }, [auth.loading, auth.user, channelSlug, loadError, loading, passport]);
}
