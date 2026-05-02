import { ImageResponse } from "next/og";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";

export const runtime = "nodejs";
export const revalidate = 60;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "CORE — member";

export async function generateImageMetadata({ params }: { params: { slug: string } }) {
  const member = MEMBERS_BY_SLUG[params.slug];
  if (!member) return [];
  return [
    {
      id: member.slug,
      alt: `${member.stageName} — CORE`,
      contentType: "image/png" as const,
      size,
    },
  ];
}

export async function generateStaticParams() {
  return MEMBERS.map((m) => ({ slug: m.slug }));
}

export default async function MemberOG({ params }: { params: { slug: string } }) {
  const member = MEMBERS_BY_SLUG[params.slug];
  if (!member) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%" }} />,
      { ...size },
    );
  }

  const primaryHandle =
    member.socials.find((s) => s.platform === "youtube")?.handle ??
    member.socials.find((s) => s.platform === "twitch")?.handle ??
    `@${member.slug}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: "64px",
          backgroundColor: "#06070a",
          backgroundImage: `linear-gradient(135deg, ${member.accent}33 0%, transparent 50%)`,
          color: "#f2f3f5",
          fontFamily: "Inter, system-ui",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div
            style={{
              fontSize: 18,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#8a8e97",
              fontFamily: "monospace",
            }}
          >
            CORE / member
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div
              style={{
                fontSize: 24,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: member.accent,
                fontFamily: "monospace",
              }}
            >
              ●  {member.slug}
            </div>
            <div
              style={{
                fontSize: 200,
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 0.9,
                color: "#f2f3f5",
              }}
            >
              {member.stageName}
            </div>
            <div style={{ fontSize: 28, color: "#8a8e97" }}>{member.realName}</div>
            <div
              style={{
                fontSize: 20,
                color: member.accent,
                fontFamily: "monospace",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              {primaryHandle}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div
              style={{
                fontSize: 16,
                color: "#8a8e97",
                fontFamily: "monospace",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              CORE
            </div>
            <div style={{ fontSize: 16, color: "#8a8e97", fontFamily: "monospace" }}>
              corecrew.org/m/{member.slug}
            </div>
          </div>
        </div>

        {/* Member-accent slab on the right */}
        <div
          style={{
            width: 8,
            height: "100%",
            background: member.accent,
            boxShadow: `0 0 60px ${member.accent}66`,
            marginLeft: 48,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
