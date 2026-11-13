import { writeFile } from "node:fs/promises";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { CoreSymbolArt } from "../components/brand/CoreSymbol";

async function main() {
  const appDirectory = path.resolve("app");
  // Keep every favicon format and the navbar on the same drawing.
  const source = Buffer.from(renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#08080a" />
      <g transform="translate(4 4) scale(.875)" color="#fff">
        <CoreSymbolArt />
      </g>
    </svg>,
  ));
  // Next's numbered icon convention advertises the vector alongside icon.png.
  await writeFile(path.join(appDirectory, "icon1.svg"), source);

  for (const [filename, size] of [["icon.png", 512], ["apple-icon.png", 180]] as const) {
    await sharp(source).resize(size, size).png().toFile(path.join(appDirectory, filename));
  }

  // PNG-backed ICO frames cover the small sizes used by browser tabs and bookmarks.
  const sizes = [16, 32, 48];
  const frames = await Promise.all(sizes.map(async (size) => ({
    size,
    png: await sharp(source).resize(size, size).png().toBuffer(),
  })));
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  for (const [index, { size, png }] of frames.entries()) {
    const entry = 6 + index * 16;
    header[entry] = size;
    header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  }
  await writeFile(path.join(appDirectory, "favicon.ico"), Buffer.concat([header, ...frames.map(({ png }) => png)]));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
