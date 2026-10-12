import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { AnnotationInput, CreatorInput } from "@/lib/creator-tags/model";
import { creatorTagDashboard, saveCreator, submitCreatorAnnotation, reviewCreatorAnnotation, scanCreatorMentions } from "@/lib/creator-tags/store";
import { creatorOcrConfigured } from "@/lib/creator-tags/ocr";
import { boundedCreatorJson, creatorError, sameOrigin } from "@/lib/creator-tags/http";
import { playableFromUrl } from "@/lib/watch/playable";
import { getLocalMetadataAnalyzer, prepareWatchItem } from "@/lib/media-intelligence/analyzer";
import { PostgresMediaIntelligenceStore } from "@/lib/media-intelligence/postgres-store";
import type { WatchItem } from "@/lib/watch/types";
import { fetchLiveStreams } from "@/lib/twitch";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("creator"), creator: CreatorInput }),
  z.object({ action: z.literal("annotation"), annotation: AnnotationInput, editId: z.string().uuid().optional() }),
  z.object({ action: z.enum(["publish", "reject", "revoke"]), id: z.string().uuid() }),
  z.object({ action: z.literal("scan") }),
  z.object({ action: z.literal("source"), url: z.string().url().max(500), title: z.string().trim().min(3).max(200) }),
]);
export async function GET(request: Request) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.response;
  try { return NextResponse.json({ ...await creatorTagDashboard(new URL(request.url).searchParams.get("q") ?? ""), imageTextReady: creatorOcrConfigured() }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return creatorError("Creator tags are unavailable. Check media-index connectivity.", 503); }
}
export async function POST(request: Request) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.response;
  if (!sameOrigin(request)) return creatorError("Invalid origin.", 403);
  try {
    const parsed = Input.safeParse(await boundedCreatorJson(request));
    if (!parsed.success) return creatorError("Check the creator profile, evidence and time range.");
    const input = parsed.data;
    if (input.action === "source") {
      const requested = new URL(input.url);
      if (requested.username || requested.password || requested.port) return creatorError("Use a public provider URL without credentials or a custom port.");
      const playable = playableFromUrl(input.url);
      if (!playable || !["youtube", "twitch"].includes(playable.platform)) return creatorError("Use a YouTube video, Twitch stream or Twitch VOD URL.");
      const sourceUrl = playable.youtubeId ? `https://www.youtube.com/${playable.kind === "live" ? `live/${playable.youtubeId}` : `watch?v=${playable.youtubeId}`}`
        : playable.vodId ? `https://www.twitch.tv/videos/${playable.vodId}`
        : playable.clipId ? `https://clips.twitch.tv/${playable.clipId}`
        : `https://www.twitch.tv/${playable.twitchLogin}`;
      const item: WatchItem = { id: playable.key, platform: playable.platform, kind: playable.kind, title: input.title, poster: "", backdrop: "",
        memberSlug: null, memberLabel: "External channel", accent: "#ff5364", href: sourceUrl, sourceUrl,
        format: playable.kind === "live" ? "live" : "long" };
      if (playable.platform === "twitch" && playable.kind === "live" && playable.twitchLogin) {
        const stream = (await fetchLiveStreams([playable.twitchLogin]))[0];
        if (!stream) return creatorError("That Twitch channel is offline. Index its current broadcast when it is live.");
        item.publishedAt = stream.started_at;
        item.live = { startedAt: stream.started_at, streamId: stream.id, login: playable.twitchLogin };
      }
      const analyzer = getLocalMetadataAnalyzer(), store = new PostgresMediaIntelligenceStore();
      const prepared = prepareWatchItem(item, analyzer);
      await store.prepareRevision(prepared.asset, prepared.revision);
      if (await store.claimAnalysis(prepared.claim) === "claimed") await store.completeAnalysis(await analyzer.analyze(item, prepared.asset, prepared.revision, prepared.claim));
      return NextResponse.json({ result: { assetKey: prepared.asset.key } });
    }
    const result = input.action === "creator" ? await saveCreator(input.creator, auth.id)
      : input.action === "annotation" ? await submitCreatorAnnotation(input.annotation, auth.id, input.editId)
      : input.action === "scan" ? await scanCreatorMentions(50)
      : await reviewCreatorAnnotation(input.id, input.action, auth.id);
    return NextResponse.json({ result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return creatorError("Could not save this change. Check the source revision and tag status."); }
}
