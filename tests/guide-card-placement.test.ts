import assert from 'node:assert/strict';
import test from 'node:test';
import { placeGuideCard } from '../lib/watch/guide-card-placement';
test('dense programs keep readable widths, bounded positions and separate tiers at the timeline edge', () => {
  const ends: number[] = [];
  const cards = Array.from({length: 100}, (_, i) => placeGuideCard(1100 + i, 240, ends, 1280));
  for (const card of cards) { assert.equal(card.width, 240); assert.ok(card.left >= 0); assert.ok(card.left + card.width <= 1280); }
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a=cards[i]!, b=cards[j]!;
    if(a.slot === b.slot) assert.ok(a.left+a.width+12 <= b.left || b.left+b.width+12 <= a.left);
  }
});
test('normal cards use chronological space and reuse available tiers', () => {
  const ends: number[]=[];
  const first=placeGuideCard(0,240,ends,1280),second=placeGuideCard(300,240,ends,1280);
  assert.equal(first.slot,0);assert.equal(second.slot,0);assert.equal(second.left,300);
});
