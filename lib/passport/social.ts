import "server-only";

import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db";
import {
  appendPassportLedger,
  consumePassportRateLimit,
  prunePassportAssetReferences,
  resolveFanRecipient,
} from "@/lib/passport/internal";
import { PassportError } from "@/lib/passport/policy";

const GIFT_TTL_DAYS = 7;
const TRADE_TTL_DAYS = 7;
const TRADE_COOLING_MINUTES = 60;

async function requireEstablishedAccount(client:PoolClient,userId:string){
  const result=await client.query<{established:boolean}>(`SELECT created_at <= now()-interval '7 days' AS established FROM fan_users WHERE id=$1`,[userId]);
  if(!result.rows[0])throw new PassportError("not_found",404);
  if(!result.rows[0].established)throw new PassportError("not_eligible",403,"account_must_be_seven_days_old");
}

export async function createPassportGift(userId:string,input:{cardId:string;recipient:string;message?:string;idempotencyKey:string}){
  await consumePassportRateLimit(userId,"gift.create");
  return withTransaction(async(client)=>{
    await requireEstablishedAccount(client,userId);
    const requestKey=`gift:${userId}:${input.idempotencyKey}`;
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[requestKey]);
    const existing=await client.query(`SELECT * FROM passport_gifts WHERE request_key=$1`,[requestKey]);
    if(existing.rows[0])return existing.rows[0];
    const recipient=await resolveFanRecipient(client,input.recipient,userId);
    const card=(await client.query<{id:string;account_bound:boolean;giftable:boolean;state:string}>(`SELECT c.id::text,e.account_bound,e.giftable,c.state FROM passport_cards c JOIN passport_card_editions e ON e.id=c.edition_id WHERE c.id=$1 AND c.owner_user_id=$2 FOR UPDATE OF c`,[input.cardId,userId])).rows[0];
    if(!card)throw new PassportError("not_found",404,"card_not_found");
    if(card.state!=="active"||card.account_bound||!card.giftable)throw new PassportError("not_eligible",403,"card_not_giftable");
    const gift=(await client.query(`INSERT INTO passport_gifts(request_key,card_id,sender_user_id,recipient_user_id,message,expires_at) VALUES($1,$2,$3,$4,$5,now()+make_interval(days=>$6)) RETURNING *`,[requestKey,input.cardId,userId,recipient.id,input.message ?? null,GIFT_TTL_DAYS])).rows[0];
    await client.query(`UPDATE passport_cards SET state='locked',lock_reason=$2,updated_at=now() WHERE id=$1`,[input.cardId,`gift:${gift.id}`]);
    await appendPassportLedger(client,{idempotencyKey:`${requestKey}:ledger`,userId,action:"gift.create",assetType:"card",assetId:input.cardId,sourceType:"gift",sourceId:String(gift.id),actorType:"fan",actorId:userId,data:{recipientUserId:recipient.id}});
    return gift;
  });
}

export async function resolvePassportGift(userId:string,input:{giftId:string;decision:"accept"|"decline"|"cancel";idempotencyKey:string}){
  await consumePassportRateLimit(userId,"gift.resolve");
  return withTransaction(async(client)=>{
    const gift=(await client.query(`SELECT * FROM passport_gifts WHERE id=$1 FOR UPDATE`,[input.giftId])).rows[0];
    if(!gift)throw new PassportError("not_found",404);
    const isSender=gift.sender_user_id===userId;const isRecipient=gift.recipient_user_id===userId;
    if(input.decision==="cancel"&&!isSender)throw new PassportError("forbidden",403);
    if(input.decision!=="cancel"&&!isRecipient)throw new PassportError("forbidden",403);
    if(gift.state!=="pending")return gift;
    if(new Date(gift.expires_at).getTime()<=Date.now()){
      await client.query(
        `UPDATE passport_cards SET state='active',lock_reason=NULL,updated_at=now()
          WHERE id=$1 AND owner_user_id=$2 AND state='locked' AND lock_reason=$3`,
        [gift.card_id,gift.sender_user_id,`gift:${gift.id}`],
      );
      return (await client.query(
        `UPDATE passport_gifts SET state='expired',resolved_at=now()
          WHERE id=$1 AND state='pending' RETURNING *`,[gift.id],
      )).rows[0] ?? gift;
    }
    const key=`gift-resolve:${userId}:${input.idempotencyKey}`;
    const ledger=await appendPassportLedger(client,{idempotencyKey:key,userId,action:`gift.${input.decision}`,assetType:"gift",assetId:input.giftId,sourceType:"gift",sourceId:input.giftId,actorType:"fan",actorId:userId});
    if(ledger===null)return gift;
    const card=(await client.query(`SELECT * FROM passport_cards WHERE id=$1 FOR UPDATE`,[gift.card_id])).rows[0];
    if(!card||card.owner_user_id!==gift.sender_user_id||card.state!=="locked"||card.lock_reason!==`gift:${gift.id}`)throw new PassportError("conflict",409,"gift_card_changed");
    const nextState=input.decision==="accept"?"accepted":input.decision==="decline"?"declined":"cancelled";
    if(input.decision==="accept"){
      await prunePassportAssetReferences(client,gift.sender_user_id,{cardIds:[String(gift.card_id)],achievementCodes:[],cosmeticCodes:[]});
      await client.query(`UPDATE passport_cards SET owner_user_id=$2,state='active',lock_reason=NULL,acquired_via='gift',acquired_at=now(),updated_at=now() WHERE id=$1`,[gift.card_id,gift.recipient_user_id]);
      await appendPassportLedger(client,{
        idempotencyKey:`gift:${gift.id}:transfer:${gift.card_id}`,
        userId:gift.recipient_user_id,action:"gift.transfer",assetType:"card",assetId:String(gift.card_id),
        sourceType:"gift",sourceId:String(gift.id),actorType:"fan",actorId:userId,
        data:{fromUserId:gift.sender_user_id},
      });
    }
    else await client.query(`UPDATE passport_cards SET state='active',lock_reason=NULL,updated_at=now() WHERE id=$1`,[gift.card_id]);
    return (await client.query(`UPDATE passport_gifts SET state=$2,resolved_at=now() WHERE id=$1 RETURNING *`,[gift.id,nextState])).rows[0];
  });
}

async function validateTradeCards(
  client:PoolClient,
  ownerId:string,
  cardIds:string[],
  mode:"offered"|"requested",
  lock:boolean,
){
  const result=await client.query<{id:string;state:string;account_bound:boolean;tradeable:boolean}>(
    `SELECT c.id::text,c.state,e.account_bound,e.tradeable
       FROM passport_cards c JOIN passport_card_editions e ON e.id=c.edition_id
      WHERE c.owner_user_id=$1 AND c.id=ANY($2::uuid[])
      ${lock?"FOR UPDATE OF c":""}`,[ownerId,cardIds],
  );
  if(result.rows.length!==cardIds.length||result.rows.some(card=>card.state!=="active"||card.account_bound||!card.tradeable))throw new PassportError("not_eligible",403,`${mode}_card_not_tradeable`);
}

export async function createPassportTrade(userId:string,input:{recipient:string;offeredCardIds:string[];requestedCardIds:string[];message?:string;idempotencyKey:string}){
  await consumePassportRateLimit(userId,"trade.create");
  return withTransaction(async(client)=>{
    await requireEstablishedAccount(client,userId);const requestKey=`trade:${userId}:${input.idempotencyKey}`;
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[requestKey]);
    const existing=await client.query(`SELECT * FROM passport_trades WHERE request_key=$1`,[requestKey]);if(existing.rows[0])return existing.rows[0];
    const recipient=await resolveFanRecipient(client,input.recipient,userId);await requireEstablishedAccount(client,recipient.id);
    await validateTradeCards(client,userId,input.offeredCardIds,"offered",true);
    // Requested cards remain merely a proposal until the recipient accepts;
    // locking both parties at creation makes reciprocal proposals deadlock.
    await validateTradeCards(client,recipient.id,input.requestedCardIds,"requested",false);
    const trade=(await client.query(`INSERT INTO passport_trades(request_key,proposer_user_id,recipient_user_id,message,expires_at) VALUES($1,$2,$3,$4,now()+make_interval(days=>$5)) RETURNING *`,[requestKey,userId,recipient.id,input.message ?? null,TRADE_TTL_DAYS])).rows[0];
    for(const cardId of input.offeredCardIds)await client.query(`INSERT INTO passport_trade_items(trade_id,card_id,side,owner_user_id) VALUES($1,$2,'offered',$3)`,[trade.id,cardId,userId]);
    for(const cardId of input.requestedCardIds)await client.query(`INSERT INTO passport_trade_items(trade_id,card_id,side,owner_user_id,released_at) VALUES($1,$2,'requested',$3,now())`,[trade.id,cardId,recipient.id]);
    await client.query(`UPDATE passport_cards SET state='locked',lock_reason=$2,updated_at=now() WHERE owner_user_id=$1 AND id=ANY($3::uuid[])`,[userId,`trade:${trade.id}`,input.offeredCardIds]);
    await appendPassportLedger(client,{idempotencyKey:`${requestKey}:ledger`,userId,action:"trade.create",assetType:"trade",assetId:String(trade.id),sourceType:"trade",sourceId:String(trade.id),actorType:"fan",actorId:userId,data:{recipientUserId:recipient.id,offeredCardIds:input.offeredCardIds,requestedCardIds:input.requestedCardIds}});return trade;
  });
}

async function releaseTrade(client:PoolClient,tradeId:string,state:"declined"|"cancelled"|"expired"|"revoked"){
  await client.query(`UPDATE passport_cards c SET state='active',lock_reason=NULL,updated_at=now() FROM passport_trade_items i WHERE i.trade_id=$1 AND i.card_id=c.id AND c.state='locked' AND c.lock_reason=$2`,[tradeId,`trade:${tradeId}`]);
  await client.query(`UPDATE passport_trade_items SET released_at=COALESCE(released_at,now()) WHERE trade_id=$1`,[tradeId]);
  return (await client.query(`UPDATE passport_trades SET state=$2,resolved_at=now() WHERE id=$1 RETURNING *`,[tradeId,state])).rows[0];
}

export async function resolvePassportTrade(userId:string,input:{tradeId:string;decision:"accept"|"confirm"|"decline"|"cancel";idempotencyKey:string}){
  await consumePassportRateLimit(userId,"trade.resolve");
  return withTransaction(async(client)=>{
    const trade=(await client.query(`SELECT * FROM passport_trades WHERE id=$1 FOR UPDATE`,[input.tradeId])).rows[0];if(!trade)throw new PassportError("not_found",404);
    const proposer=trade.proposer_user_id===userId;const recipient=trade.recipient_user_id===userId;if(!proposer&&!recipient)throw new PassportError("forbidden",403);
    const key=`trade-resolve:${userId}:${input.idempotencyKey}`;
    const replay=await client.query(`SELECT 1 FROM passport_ledger WHERE idempotency_key=$1`,[key]);
    if(replay.rows[0])return trade;
    if(trade.state==="cooling_off"&&trade.executes_at&&new Date(trade.executes_at).getTime()<=Date.now()){
      return completeTrade(client,trade.id);
    }
    if(new Date(trade.expires_at).getTime()<=Date.now()&&['pending','awaiting_confirmation'].includes(trade.state)){
      return releaseTrade(client,trade.id,"expired");
    }
    const canCancel=trade.state==="cooling_off"
      ? (proposer||recipient)
      : proposer&&['pending','awaiting_confirmation'].includes(trade.state);
    if(input.decision==="cancel"&&!canCancel)return trade;
    if(input.decision==="decline"&&(!recipient||!['pending','awaiting_confirmation'].includes(trade.state)))throw new PassportError("forbidden",403);
    if(input.decision==="accept"&&(!recipient||trade.state!=="pending"))throw new PassportError("invalid_state",409);
    if(input.decision==="confirm"&&trade.state!=="awaiting_confirmation")throw new PassportError("invalid_state",409,"trade_not_ready_for_confirmation");
    const ledger=await appendPassportLedger(client,{idempotencyKey:key,userId,action:`trade.${input.decision}`,assetType:"trade",assetId:trade.id,sourceType:"trade",sourceId:trade.id,actorType:"fan",actorId:userId});
    if(ledger===null)return trade;
    if(input.decision==="cancel")return releaseTrade(client,trade.id,"cancelled");
    if(input.decision==="decline")return releaseTrade(client,trade.id,"declined");
    if(input.decision==="accept"){
      const requested=(await client.query<{card_id:string;owner_user_id:string}>(`SELECT card_id::text,owner_user_id FROM passport_trade_items WHERE trade_id=$1 AND side='requested' FOR UPDATE`,[trade.id])).rows;
      await validateTradeCards(client,trade.recipient_user_id,requested.map(item=>item.card_id),"requested",true);
      await client.query(`UPDATE passport_trade_items SET released_at=NULL WHERE trade_id=$1 AND side='requested'`,[trade.id]);
      const locked=await client.query(`UPDATE passport_cards SET state='locked',lock_reason=$2,updated_at=now() WHERE owner_user_id=$1 AND id=ANY($3::uuid[]) AND state='active' RETURNING id`,[trade.recipient_user_id,`trade:${trade.id}`,requested.map(item=>item.card_id)]);
      if((locked.rowCount ?? 0)!==requested.length)throw new PassportError("conflict",409,"requested_card_changed");
      return (await client.query(`UPDATE passport_trades SET state='awaiting_confirmation',accepted_at=now() WHERE id=$1 RETURNING *`,[trade.id])).rows[0];
    }
    if(input.decision==="confirm"){
      const next=(await client.query(`UPDATE passport_trades SET proposer_confirmed=CASE WHEN proposer_user_id=$2 THEN true ELSE proposer_confirmed END,recipient_confirmed=CASE WHEN recipient_user_id=$2 THEN true ELSE recipient_confirmed END WHERE id=$1 RETURNING *`,[trade.id,userId])).rows[0];
      if(next.proposer_confirmed&&next.recipient_confirmed)return (await client.query(`UPDATE passport_trades SET state='cooling_off',executes_at=now()+make_interval(mins=>$2) WHERE id=$1 RETURNING *`,[trade.id,TRADE_COOLING_MINUTES])).rows[0];
      return next;
    }
    throw new PassportError("invalid_input",400);
  });
}

async function completeTrade(client:PoolClient,tradeId:string){
  const trade=(await client.query(`SELECT * FROM passport_trades WHERE id=$1 FOR UPDATE`,[tradeId])).rows[0];if(!trade||trade.state!=="cooling_off"||!trade.executes_at||new Date(trade.executes_at).getTime()>Date.now())return trade;
  const items=(await client.query<{card_id:string;side:"offered"|"requested"}>(`SELECT card_id::text,side FROM passport_trade_items WHERE trade_id=$1 FOR UPDATE`,[tradeId])).rows;
  const cards=(await client.query<{id:string;owner_user_id:string;state:string;lock_reason:string|null}>(`SELECT id::text,owner_user_id,state,lock_reason FROM passport_cards WHERE id=ANY($1::uuid[]) FOR UPDATE`,[items.map(i=>i.card_id)])).rows;
  if(cards.length!==items.length||cards.some(card=>card.state!=="locked"||card.lock_reason!==`trade:${tradeId}`)){
    const revoked=await releaseTrade(client,tradeId,"revoked");
    await appendPassportLedger(client,{idempotencyKey:`trade:${tradeId}:integrity-revoke`,action:"trade.revoke",assetType:"trade",assetId:tradeId,sourceType:"trade",sourceId:tradeId,actorType:"system",data:{reason:"escrow_integrity_failed"}});
    return revoked;
  }
  const sides=new Map(items.map(i=>[i.card_id,i.side]));for(const card of cards){const destination=sides.get(card.id)==="offered"?trade.recipient_user_id:trade.proposer_user_id;await prunePassportAssetReferences(client,card.owner_user_id,{cardIds:[card.id],achievementCodes:[],cosmeticCodes:[]});await client.query(`UPDATE passport_cards SET owner_user_id=$2,state='active',lock_reason=NULL,acquired_via='trade',acquired_at=now(),updated_at=now() WHERE id=$1`,[card.id,destination]);await appendPassportLedger(client,{idempotencyKey:`trade:${tradeId}:transfer:${card.id}`,userId:destination,action:"trade.transfer",assetType:"card",assetId:card.id,sourceType:"trade",sourceId:tradeId,actorType:"system",data:{fromUserId:card.owner_user_id}});}
  await client.query(`UPDATE passport_trade_items SET released_at=now() WHERE trade_id=$1`,[tradeId]);return (await client.query(`UPDATE passport_trades SET state='completed',completed_at=now(),resolved_at=now() WHERE id=$1 RETURNING *`,[tradeId])).rows[0];
}

/** Lazily settles expired/cooling workflows whenever either party loads Passport. */
export async function settlePassportWorkflows(userId:string):Promise<void>{await withTransaction(async(client)=>{
  const expiredGifts=(await client.query<{id:string;card_id:string}>(`SELECT id::text,card_id::text FROM passport_gifts WHERE (sender_user_id=$1 OR recipient_user_id=$1) AND state='pending' AND expires_at<=now() FOR UPDATE`,[userId])).rows;
  for(const gift of expiredGifts){await client.query(`UPDATE passport_cards SET state='active',lock_reason=NULL,updated_at=now() WHERE id=$1 AND state='locked' AND lock_reason=$2`,[gift.card_id,`gift:${gift.id}`]);await client.query(`UPDATE passport_gifts SET state='expired',resolved_at=now() WHERE id=$1`,[gift.id]);}
  const expiredTrades=(await client.query<{id:string}>(`SELECT id::text FROM passport_trades WHERE (proposer_user_id=$1 OR recipient_user_id=$1) AND state IN('pending','awaiting_confirmation') AND expires_at<=now() FOR UPDATE`,[userId])).rows;for(const trade of expiredTrades)await releaseTrade(client,trade.id,"expired");
  const due=(await client.query<{id:string}>(`SELECT id::text FROM passport_trades WHERE (proposer_user_id=$1 OR recipient_user_id=$1) AND state='cooling_off' AND executes_at<=now() FOR UPDATE`,[userId])).rows;for(const trade of due)await completeTrade(client,trade.id);
});}

/** Bounded maintenance sweep for timed escrow settlement. Safe to run concurrently. */
export async function settleDuePassportWorkflows(limit=100):Promise<{expiredGifts:number;expiredTrades:number;completedTrades:number}>{
  const bounded=Math.max(1,Math.min(Math.floor(limit),250));
  return withTransaction(async(client)=>{
    const gifts=(await client.query<{id:string;card_id:string;sender_user_id:string}>(`SELECT id::text,card_id::text,sender_user_id
      FROM passport_gifts WHERE state='pending' AND expires_at<=now()
      ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED`,[bounded])).rows;
    for(const gift of gifts){
      await client.query(`UPDATE passport_cards SET state='active',lock_reason=NULL,updated_at=now()
        WHERE id=$1 AND owner_user_id=$2 AND state='locked' AND lock_reason=$3`,[gift.card_id,gift.sender_user_id,`gift:${gift.id}`]);
      await client.query(`UPDATE passport_gifts SET state='expired',resolved_at=now() WHERE id=$1 AND state='pending'`,[gift.id]);
    }
    const trades=(await client.query<{id:string}>(`SELECT id::text FROM passport_trades
      WHERE state IN('pending','awaiting_confirmation') AND expires_at<=now()
      ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED`,[bounded])).rows;
    for(const trade of trades)await releaseTrade(client,trade.id,"expired");
    const due=(await client.query<{id:string}>(`SELECT id::text FROM passport_trades
      WHERE state='cooling_off' AND executes_at<=now()
      ORDER BY executes_at LIMIT $1 FOR UPDATE SKIP LOCKED`,[bounded])).rows;
    let completedTrades=0;
    for(const trade of due){
      const settled=await completeTrade(client,trade.id);
      if(settled?.state==="completed")completedTrades++;
    }
    return{expiredGifts:gifts.length,expiredTrades:trades.length,completedTrades};
  });
}
