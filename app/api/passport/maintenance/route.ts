import { NextResponse } from "next/server";
import { drainPassportActivityOutbox } from "@/lib/passport/activity";
import { settleDuePassportWorkflows } from "@/lib/passport/social";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  const expected=process.env.METRICS_CRON_SECRET?.trim();
  const supplied=request.headers.get("x-cron-secret")?.trim();
  if(!expected)return NextResponse.json({error:"cron_not_configured"},{status:500});
  if(!supplied||supplied!==expected)return NextResponse.json({error:"unauthorized"},{status:401});
  const workflows=await settleDuePassportWorkflows(200);
  const activity=await drainPassportActivityOutbox({limit:250});
  return NextResponse.json({ok:true,workflows,activity},{headers:{"Cache-Control":"no-store"}});
}
