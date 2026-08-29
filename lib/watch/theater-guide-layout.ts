/**
 * Sizing rules for the compact Theater guide. Timeline duration is important,
 * but it cannot be the only source of card width: a five-minute video still
 * needs enough room to identify it before a viewer tunes in.
 */
export const THEATER_GUIDE_MIN_PROGRAM_WIDTH = 168;
export const THEATER_GUIDE_MAX_PROGRAM_WIDTH = 392;

type ProgramCardWidthInput = {
  title: string;
  durationWidth: number;
  hasArtwork: boolean;
  /** Active live programs must visually bridge the Now marker. */
  isLive?: boolean;
};

export function theaterGuideProgramWidth({
  title,
  durationWidth,
  hasArtwork,
  isLive = false,
}: ProgramCardWidthInput): number {
  // Leave roughly 15–28 readable title characters beside the artwork. The
  // cap keeps short scheduled blocks from obscuring the rest of the timeline.
  const compactTitle = title.trim().replace(/\s+/g, " ");
  const copyWidth = Math.min(210, Math.max(102, compactTitle.length * 4.8));
  const readableWidth = copyWidth + (hasArtwork ? 78 : 18) + 22;

  const requiredWidth = Math.max(THEATER_GUIDE_MIN_PROGRAM_WIDTH, durationWidth, readableWidth);
  // A live program owns this lane until it ends. Do not visually truncate it
  // before Now merely because the compact VOD-card cap is smaller than its
  // elapsed duration.
  return Math.round(isLive ? requiredWidth : Math.min(THEATER_GUIDE_MAX_PROGRAM_WIDTH, requiredWidth));
}

/**
 * Hover/focus may temporarily expose a little more copy, without changing
 * the time placement of the card in the underlying schedule.
 */
export function theaterGuideProgramExpandedWidth({
  title,
  durationWidth,
  hasArtwork,
  isLive = false,
}: ProgramCardWidthInput): number {
  const compactTitle = title.trim().replace(/\s+/g, " ");
  const fullCopyWidth = Math.min(270, Math.max(146, compactTitle.length * 5.7));
  const readableWidth = fullCopyWidth + (hasArtwork ? 78 : 18) + 28;

  const requiredWidth = Math.max(
    theaterGuideProgramWidth({ title, durationWidth, hasArtwork, isLive }),
    readableWidth,
  );
  return Math.round(isLive ? requiredWidth : Math.min(THEATER_GUIDE_MAX_PROGRAM_WIDTH, requiredWidth));
}
