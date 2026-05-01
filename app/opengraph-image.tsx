import { ImageResponse } from "next/og";
import { MEMBERS } from "@coreboys/shared";

export const runtime = "nodejs";
export const revalidate = 60;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "The Core Boys — Create. Own. Run. Everything.";

/**
 * Root OG image. CORE wordmark on the left, live-count badge on the right.
 * Live count is fetched at request time from the same /api/twitch/live route
 * the page uses. Cached 60s via the runtime's `revalidate`.
 */
export default async function OG() {
  const liveCount = await fetchLiveCount();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          backgroundColor: "#06070a",
          backgroundImage:
            "radial-gradient(80% 60% at 30% 50%, rgba(255,106,0,0.18), transparent 60%)",
          color: "#f2f3f5",
          fontFamily: "Inter, system-ui",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div
            style={{
              fontSize: 18,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#8a8e97",
              fontFamily: "monospace",
            }}
          >
            The Core Boys · est. 2026
          </div>
          <LiveBadge count={liveCount} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <div
            style={{
              fontSize: 280,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 0.9,
              backgroundImage:
                "linear-gradient(135deg, #ffffff 0%, #ffd5a3 40%, #ff6a00 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            CORE
          </div>
          <div
            style={{
              fontSize: 28,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#f2f3f5",
              fontFamily: "monospace",
            }}
          >
            Create. Own. Run. Everything.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 12, fontSize: 16, color: "#8a8e97" }}>
            {MEMBERS.map((m) => (
              <span key={m.slug} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    display: "flex",
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: m.accent,
                  }}
                />
                {m.name}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 16, color: "#8a8e97", fontFamily: "monospace" }}>
            thecoreboys.com
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

function LiveBadge({ count }: { count: number | null }) {
  const live = (count ?? 0) > 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 20px",
        borderRadius: 999,
        border: `1px solid ${live ? "#FF1F3D" : "#1a1d23"}`,
        background: "rgba(6,7,10,0.7)",
        color: live ? "#f2f3f5" : "#8a8e97",
      }}
    >
      <span
        style={{
          display: "flex",
          width: 12,
          height: 12,
          borderRadius: 999,
          background: live ? "#FF1F3D" : "#3a3d43",
          boxShadow: live ? "0 0 16px #FF1F3D88" : "none",
        }}
      />
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 18,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        {live ? `${count} BOYS LIVE NOW` : "QUIET"}
      </span>
    </div>
  );
}

async function fetchLiveCount(): Promise<number | null> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/twitch/live`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { live?: { isLive: boolean }[] };
    return data.live?.filter((l) => l.isLive).length ?? 0;
  } catch {
    return null;
  }
}
