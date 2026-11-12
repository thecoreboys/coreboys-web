/** pnpm exec tsx scripts/generate-social-images.tsx */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { MEMBERS } from "../lib/members";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "public/social");

async function card(name: string, photoPath: string, target: string, subtitle: string, href: string) {
  // Reuse the published photos without changing faces or cropping the image.
  const photo = await sharp(resolve(root, "public", photoPath.replace(/^\/+/, ""))).png().toBuffer();
  const response = new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#111110", color: "#f5f2ea", padding: 35, gap: 34, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 536, height: 560, padding: "26px 16px", justifyContent: "space-between" }}>
        <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-.05em", fontStyle: "italic" }}>CORE</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: name.length > 13 ? 64 : 78, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-.055em" }}>{name}</div>
          <div style={{ fontSize: 25, lineHeight: 1.45, color: "#c6c0b5" }}>{subtitle}</div>
        </div>
        <div style={{ fontSize: 20, color: "#c2a46f" }}>{href}</div>
      </div>
      {/* Native OG layout preserves the complete supplied square/group photo. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/png;base64,${photo.toString("base64")}`} width={560} height={560} alt="" style={{ objectFit: "contain", borderRadius: 8 }} />
    </div>,
    { width: 1200, height: 630 },
  );
  await writeFile(resolve(output, target), Buffer.from(await response.arrayBuffer()));
}

async function main() {
  await mkdir(output, { recursive: true });
  await card("The Core Boys", "/special-message/core-huddle.webp", "core-boys-share-2026.png", "Live streams, clips & shows.", "thecoreboys.com");
  for (const member of MEMBERS) await card(member.stageName, member.portrait, `${member.slug}-share-2026.png`, "Streams, videos & community.", `thecoreboys.com/channels/${member.slug}`);
  console.log(`Generated ${MEMBERS.length + 1} social cards from existing CORE photos.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
