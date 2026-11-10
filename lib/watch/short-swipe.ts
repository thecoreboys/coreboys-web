/** Map an intentional vertical gesture to a single short-form navigation step. */
export function shortSwipeDirection(dx: number, dy: number): "next" | "previous" | null {
  if (Math.abs(dy) < 60 || Math.abs(dy) < Math.abs(dx) * 1.3) return null;
  return dy < 0 ? "next" : "previous";
}
