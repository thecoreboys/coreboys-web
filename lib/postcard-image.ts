import sharp from "sharp";
import { POSTCARD_LIMITS } from "./postcard";

const DATA_IMAGE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_INPUT_PIXELS = 20_000_000;
const MAX_OUTPUT_EDGE = 1_875;
const SIGNATURE_DATA_IMAGE = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_SIGNATURE_INPUT_BYTES = 165_000;
const MAX_SIGNATURE_INPUT_PIXELS = 2_000_000;
export const MAX_POSTCARD_SIGNATURE_BYTES = 120_000;

/**
 * Decode and re-encode untrusted fan art before persistence. Sharp enforces a
 * pixel limit, applies EXIF orientation, drops metadata, flattens animation,
 * and emits one bounded JPEG that the print renderer can safely embed.
 */
export async function normalizePostcardImage(
  imageDataUrl: string | null | undefined,
  options: { preserveAlpha?: boolean } = {},
): Promise<string | null> {
  if (!imageDataUrl) return null;
  const match = DATA_IMAGE.exec(imageDataUrl);
  if (!match) throw new Error("Unsupported postcard image type.");
  const input = Buffer.from(match[2]!, "base64");
  if (input.length === 0 || input.length > POSTCARD_LIMITS.imageBytes) {
    throw new Error("Postcard image is too large.");
  }

  const source = sharp(input, { failOn: "warning", limitInputPixels: MAX_INPUT_PIXELS });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
    throw new Error("Unsupported postcard image data.");
  }
  if ((metadata.pages ?? 1) > 1) throw new Error("Animated postcard art is not supported.");
  if (metadata.width * metadata.height > MAX_INPUT_PIXELS) {
    throw new Error("Postcard image dimensions are too large.");
  }

  if (options.preserveAlpha && metadata.hasAlpha) {
    for (const edge of [MAX_OUTPUT_EDGE, 1_500, 1_200, 900]) {
      const output = await source
        .clone()
        .rotate()
        .resize({
          width: edge,
          height: edge,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
        .toBuffer();
      if (output.length <= POSTCARD_LIMITS.imageBytes) {
        return `data:image/png;base64,${output.toString("base64")}`;
      }
    }
    throw new Error("Transparent postcard image could not be reduced to a safe print size.");
  }

  for (const quality of [88, 78, 68, 58]) {
    const output = await source
      .clone()
      .rotate()
      .resize({
        width: MAX_OUTPUT_EDGE,
        height: MAX_OUTPUT_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer();
    if (output.length <= POSTCARD_LIMITS.imageBytes) {
      return `data:image/jpeg;base64,${output.toString("base64")}`;
    }
  }
  throw new Error("Postcard image could not be reduced to a safe print size.");
}

/**
 * Rebuild a private hand-drawn signature as one bounded, metadata-free PNG.
 * PNG is intentionally the only accepted format so transparent strokes remain
 * transparent on the writing-side paper treatment.
 */
export async function normalizePostcardSignature(
  signatureDataUrl: string | null | undefined,
): Promise<string | null> {
  if (!signatureDataUrl) return null;
  const match = SIGNATURE_DATA_IMAGE.exec(signatureDataUrl);
  if (!match) throw new Error("Postcard signature must be a PNG.");
  const input = Buffer.from(match[1]!, "base64");
  if (input.length === 0 || input.length > MAX_SIGNATURE_INPUT_BYTES) {
    throw new Error("Postcard signature is too large.");
  }
  if (
    input[0] !== 0x89
    || input[1] !== 0x50
    || input[2] !== 0x4e
    || input[3] !== 0x47
    || input[4] !== 0x0d
    || input[5] !== 0x0a
    || input[6] !== 0x1a
    || input[7] !== 0x0a
  ) throw new Error("Postcard signature data does not match PNG.");

  const source = sharp(input, { failOn: "warning", limitInputPixels: MAX_SIGNATURE_INPUT_PIXELS });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || metadata.format !== "png") {
    throw new Error("Unsupported postcard signature data.");
  }
  if ((metadata.pages ?? 1) > 1 || metadata.width * metadata.height > MAX_SIGNATURE_INPUT_PIXELS) {
    throw new Error("Postcard signature dimensions are too large.");
  }

  for (const [width, height] of [[800, 240], [640, 192], [480, 144], [320, 96]] as const) {
    const output = await source
      .clone()
      .rotate()
      .ensureAlpha()
      .resize({ width, height, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10, palette: true, colours: 64 })
      .toBuffer();
    if (output.length <= MAX_POSTCARD_SIGNATURE_BYTES) {
      return `data:image/png;base64,${output.toString("base64")}`;
    }
  }
  throw new Error("Postcard signature could not be reduced to a safe print size.");
}
