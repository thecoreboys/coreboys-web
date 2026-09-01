import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-api";
import { getFanUserByEmail, getFanUserById } from "@/lib/fan-users";
import { recordInboxNotification } from "@/lib/notification-center";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.object({ userId: z.string().uuid().optional(), email: z.string().email().optional() }).refine((v) => v.userId || v.email, { message: "userId or email is required" });

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const user = parsed.data.userId ? await getFanUserById(parsed.data.userId) : await getFanUserByEmail(parsed.data.email!);
  if (!user) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  const eventId = randomUUID();
  const deliveryId = randomUUID();
  await query(`INSERT INTO social_content_events (id,provider,member_slug,content_type,canonical_id,title,body,href,published_at,notification_eligible,platform_payload) VALUES ($1,'x','core','post',$2,$3,$4,$5,now(),true,$6::jsonb) ON CONFLICT (canonical_id) DO NOTHING`, [eventId, `admin-test:${eventId}`, "CORE notification test", `Sent by ${auth.displayName}`, "https://thecoreboys.com/account/settings#notifications", JSON.stringify({ authorLabel: "CORE", authorAvatarUrl: null })]);
  await query(`INSERT INTO social_notification_deliveries (id,event_id,user_id,channel,status,delivered_at) VALUES ($1,$2,$3,'in_app','sent',now()) ON CONFLICT (event_id,user_id,channel) DO NOTHING`, [deliveryId, eventId, user.id]);
  await recordInboxNotification({ userId: user.id, category: "creator", sourceKey: `social:${eventId}`, title: "CORE notification test", body: `Sent by ${auth.displayName}`, href: "/account/settings#notifications" });
  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
}
