import { NextResponse } from "next/server";
import { getAuthorizedPostcardMoments } from "@/lib/postcard-moments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const moments = await getAuthorizedPostcardMoments();
    return NextResponse.json(
      { moments },
      {
        headers: {
          "Cache-Control": "private, max-age=120, stale-while-revalidate=300",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    console.error("[postcard] moment catalog unavailable", error);
    return NextResponse.json({ moments: [] }, { status: 503 });
  }
}
