import type { WatchItem } from "./types";

export type BillboardFeature<Content> = {
  id: string;
  title: string;
  content: Content;
  expiresAt: number;
};

export type BillboardSlide<Content> =
  | { kind: "media"; id: string; title: string; item: WatchItem }
  | { kind: "feature"; id: string; title: string; content: Content };

export function isBillboardFeatureActive(expiresAt: number, now: number): boolean {
  return Number.isFinite(now) && Number.isFinite(expiresAt) && now < expiresAt;
}

/** Keep the lead broadcast first; editorial artwork occupies the next slot. */
export function buildBillboardSlides<Content>(items: readonly WatchItem[], feature?: BillboardFeature<Content>): BillboardSlide<Content>[] {
  const slides: BillboardSlide<Content>[] = items.map((item) => ({ kind: "media", id: item.id, title: item.title, item }));
  if (feature) slides.splice(Math.min(1, slides.length), 0, { kind: "feature", id: feature.id, title: feature.title, content: feature.content });
  return slides;
}
