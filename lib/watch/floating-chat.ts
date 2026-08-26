import { normalizeRoomRect, type NormalizedRect } from "@/lib/watch/room-layout";
import { DEFAULT_CHAT_FLOATING_RECT } from "@/lib/watch/workspace";

/**
 * CSS bridge from Room Studio's 16:9 normalized board into the live fixed
 * chat surface.  At the legacy 1440×810 reference size it produces the same
 * right/bottom offsets as v2, while staying proportional when the viewport
 * changes.
 */
export function floatingChatViewportStyle(value: Partial<NormalizedRect> | null | undefined) {
  const rect = normalizeRoomRect(value, DEFAULT_CHAT_FLOATING_RECT, {
    minWidth: 0.15,
    minHeight: 0.18,
  });
  const format = (number: number) => Number(number.toFixed(4));
  const right = format((1 - rect.x - rect.width) * 100);
  const bottom = format((1 - rect.y - rect.height) * 100);
  const width = format(rect.width * 100);
  const height = format(rect.height * 100);

  return {
    // Anchor from the trailing edges. This preserves a Studio placement when
    // the minimum readable dock size needs to win on a smaller desktop.
    right: `${right}vw`,
    bottom: `${bottom}dvh`,
    width: `clamp(18rem, ${width}vw, calc(100vw - 2rem))`,
    height: `clamp(20rem, ${height}dvh, calc(100dvh - 5rem))`,
  } as const;
}
