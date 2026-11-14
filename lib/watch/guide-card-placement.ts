/** Pack readable cards into tiers without clamping the last cards on top of one another. */
export function placeGuideCard(start: number, desiredWidth: number, ends: number[], trackWidth: number) {
  const width = Math.min(desiredWidth, trackWidth);
  const naturalLeft = Math.max(0, Math.min(start, trackWidth - width));
  let slot = ends.findIndex(end => naturalLeft >= end + 12);
  let left = naturalLeft;
  if (slot < 0 && ends.length < 2) slot = ends.length;
  else if (slot < 0) {
    slot = ends.indexOf(Math.min(...ends));
    left = Math.max(left, ends[slot]! + 12);
    if (left + width > trackWidth) { slot = ends.length; left = naturalLeft; }
  }
  ends[slot] = left + width;
  return { left, width, slot };
}
