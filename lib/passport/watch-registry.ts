import "server-only";

import { query } from "@/lib/db";
import { passportPlaybackProviderIds } from "@/lib/passport/policy";
import type { WatchCatalog, WatchItem } from "@/lib/watch/types";

type RegisteredWatchAsset={
  playbackRef:string;
  platform:string;
  aliases:string[];
  channelSlug:string;
  kind:string;
  shortForm:boolean;
  durationSeconds:number|null;
  sourceUrl:string|null;
};

function registerable(item:WatchItem):boolean{
  return item.kind!=="post"&&item.format!=="photo"&&item.embeddable!==false;
}

function registeredAsset(item:WatchItem):RegisteredWatchAsset|null{
  if(!registerable(item))return null;
  const providerIds=passportPlaybackProviderIds(item.id,item.platform);
  const providerId=providerIds.find(id=>id!==item.id)??providerIds[0]??item.id;
  const playbackRef=`${item.platform}:${providerId}`;
  const liveLogin=item.kind==="live"&&item.platform==="twitch"?item.live?.login?.trim().toLowerCase():null;
  const aliases=[
    item.id,playbackRef,`${item.platform}:${item.id}`,item.sourceUrl,
    ...providerIds,...providerIds.map(id=>`${item.platform}:${id}`),
    liveLogin,liveLogin?`twitch:${liveLogin}`:null,liveLogin?`twitch:stream:${liveLogin}`:null,
    liveLogin?`live-${liveLogin}`:null,
  ].filter((value):value is string=>Boolean(value&&value.length<=500));
  return{
    playbackRef,platform:item.platform,aliases:[...new Set(aliases)],
    channelSlug:item.memberSlug??"core",kind:item.kind,
    shortForm:item.format==="short",
    durationSeconds:item.durationSeconds&&item.durationSeconds>0?Math.floor(item.durationSeconds):null,
    sourceUrl:item.sourceUrl??null,
  };
}

/**
 * Persist the exact server-built feed catalog as the watch-credit allowlist.
 * This closes the gap between dynamic RSS/Twitch/social items and the older
 * content_items ingestion table without trusting member/duration fields from
 * the browser.
 */
export async function registerPassportWatchCatalog(catalog:WatchCatalog):Promise<number>{
  const assets=[...new Map(catalog.all.map(registeredAsset).filter((asset):asset is RegisteredWatchAsset=>Boolean(asset)).map(asset=>[asset.playbackRef,asset])).values()];
  if(!assets.length)return 0;
  const result=await query(`WITH assets AS (
      SELECT value AS asset FROM jsonb_array_elements($1::jsonb)
    ), normalized AS (
      SELECT asset->>'playbackRef' AS playback_ref,
             asset->>'platform' AS platform,
             ARRAY(SELECT jsonb_array_elements_text(asset->'aliases')) AS aliases,
             asset->>'channelSlug' AS channel_slug,
             asset->>'kind' AS kind,
             COALESCE((asset->>'shortForm')::boolean,false) AS short_form,
             NULLIF(asset->>'durationSeconds','')::integer AS duration_seconds,
             NULLIF(asset->>'sourceUrl','') AS source_url
        FROM assets
    )
    INSERT INTO passport_watch_assets
      (playback_ref,platform,aliases,channel_slug,kind,short_form,duration_seconds,source_url,last_seen_at)
    SELECT playback_ref,platform,aliases,channel_slug,kind,short_form,duration_seconds,source_url,now()
      FROM normalized
    ON CONFLICT(playback_ref) DO UPDATE SET
      platform=EXCLUDED.platform,aliases=EXCLUDED.aliases,channel_slug=EXCLUDED.channel_slug,
      kind=EXCLUDED.kind,short_form=EXCLUDED.short_form,duration_seconds=EXCLUDED.duration_seconds,source_url=EXCLUDED.source_url,
      last_seen_at=now(),updated_at=now()`,[JSON.stringify(assets)]);
  return result.rowCount??0;
}
