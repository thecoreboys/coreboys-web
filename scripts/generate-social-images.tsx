/** pnpm exec tsx scripts/generate-social-images.tsx */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { MEMBERS } from "../lib/members";
import { CoreSymbolArt } from "../components/brand/CoreSymbol";
import { socialShareImagePath } from "../lib/seo";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "public/social");

async function wordmark() {
  // Match the navbar's Barlow Condensed Bold Italic and the shared star/ring O.
  // The licensed font is bundled so regeneration does not depend on a font API.
  const font = await readFile(resolve(root, "scripts/assets/fonts/barlow-condensed/BarlowCondensed-BoldItalic.ttf"));
  // Resolve the React SVG before OG rendering, which otherwise drops the
  // custom component nested inside the inline <svg> and leaves a blank O.
  const symbol = await sharp(Buffer.from(renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" width="156" height="156" viewBox="0 0 64 64"><CoreSymbolArt fill="#fff" /></svg>,
  ))).png().toBuffer();
  const response = new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", paddingLeft: 16, color: "#fff", fontFamily: "CORE Wordmark", fontSize: 104, fontWeight: 700, fontStyle: "italic", letterSpacing: -4.68, lineHeight: .82 }}>
      <span>C</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/png;base64,${symbol.toString("base64")}`} width={78} height={78} alt="" style={{ marginLeft: 1.56, marginRight: -9.36 }} />
      <span>RE</span>
    </div>,
    { width: 320, height: 140, fonts: [{ name: "CORE Wordmark", data: font, weight: 700, style: "italic" }] },
  );
  const { data, info } = await sharp(Buffer.from(await response.arrayBuffer())).trim().png().toBuffer({ resolveWithObject: true });
  return { src: `data:image/png;base64,${data.toString("base64")}`, width: 180, height: 180 * info.height / info.width };
}

async function card(name: string, photoPath: string, target: string, subtitle: string, href: string, logo: Awaited<ReturnType<typeof wordmark>>) {
  // Reuse the published photos without changing faces or cropping the image.
  const photo = await sharp(resolve(root, "public", photoPath.replace(/^\/+/, ""))).png().toBuffer();
  const response = new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#111110", color: "#f5f2ea", padding: 35, gap: 34, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 536, height: 560, padding: "26px 16px", justifyContent: "space-between" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.src} width={logo.width} height={logo.height} alt="CORE" />
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
  await writeFile(resolve(root, "public", target.replace(/^\/+/, "")), Buffer.from(await response.arrayBuffer()));
}

async function main() {
  await mkdir(output, { recursive: true });
  const logo = await wordmark();
  await card("The Core Boys", "/special-message/core-huddle.webp", socialShareImagePath("core-boys"), "Live streams, clips & shows.", "thecoreboys.com", logo);
  for (const member of MEMBERS) await card(member.stageName, member.portrait, socialShareImagePath(member.slug), "Streams, videos & community.", `thecoreboys.com/channels/${member.slug}`, logo);
  console.log(`Generated ${MEMBERS.length + 1} social cards from existing CORE photos.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
