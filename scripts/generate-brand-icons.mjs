import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Next's numbered icon convention advertises the vector alongside icon.png.
const source = await readFile(new URL("../app/icon1.svg", import.meta.url));

for (const [filename, size] of [["icon.png", 512], ["apple-icon.png", 180]]) {
  const target = fileURLToPath(new URL("../app/" + filename, import.meta.url));
  await sharp(source).resize(size, size).png().toFile(target);
}

// PNG-backed ICO frames cover the small sizes used by browser tabs and bookmarks.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map((size) => sharp(source).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, frame] of frames.entries()) {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
}
await writeFile(new URL("../app/favicon.ico", import.meta.url), Buffer.concat([header, ...frames]));
