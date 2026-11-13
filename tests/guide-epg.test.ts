import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildEpgCells, epgNowNext } from "../lib/watch/guide-epg";
import type { GuideProgram } from "../lib/watch/guide-response";

const MIN = 60_000;
const DAY_START = Date.parse("2026-11-13T05:00:00.000Z");

function program(id: string, startMin: number, lengthMin: number, extra: Partial<GuideProgram> = {}): GuideProgram {
  const start = DAY_START + startMin * MIN;
  return {
    id, slug: "ron", login: null, title: id, game: null,
    startsAt: new Date(start).toISOString(), endsAt: new Date(start + lengthMin * MIN).toISOString(),
    status: "published", platform: "youtube", thumbnailUrl: null, vodId: null, youtubeId: null, sourceUrl: "https://example.com",
    ...extra,
  };
}

const options = {
  rangeStart: DAY_START,
  rangeEnd: DAY_START + 24 * 60 * MIN,
  minCellMs: 20 * MIN,
  endOf: (entry: GuideProgram) => Date.parse(entry.endsAt!),
};

test("programmes become non-overlapping cells that end where the next begins", () => {
  const cells = buildEpgCells([program("b", 60, 90), program("a", 0, 75)], options);
  assert.deepEqual(cells.map((cell) => [cell.id, (cell.start - DAY_START) / MIN, (cell.end - DAY_START) / MIN]), [["a", 0, 60], ["b", 60, 150]]);
});

test("runs of very short programmes merge into one readable cell", () => {
  const shorts = Array.from({ length: 12 }, (_, index) => program(`s${index}`, 120 + index, 1, { contentType: "short" }));
  const cells = buildEpgCells([program("show", 60, 60), ...shorts, program("after", 180, 45)], options);
  assert.deepEqual(cells.map((cell) => cell.id), ["show", "mix:s0", "after"]);
  assert.equal(cells[1]!.programs.length, 12);
});

test("a live programme is never merged or cut short by an overlapping archive entry", () => {
  const live = program("live", 600, 10, { status: "live" });
  const cells = buildEpgCells([live, program("clip", 605, 1)], options);
  assert.equal(cells[0]!.id, "live");
  assert.equal((cells[0]!.end - cells[0]!.start) / MIN, 10);
});

test("cells clip to the visible day but keep their real airtimes for labels", () => {
  const overnight = program("overnight", -120, 24 * 60 + 240);
  const [cell] = buildEpgCells([overnight], options);
  assert.equal(cell!.start, options.rangeStart);
  assert.equal(cell!.end, options.rangeEnd);
  assert.equal(cell!.airStart, DAY_START - 120 * MIN);
  assert.equal(cell!.airEnd, DAY_START + (24 * 60 + 120) * MIN);
});

test("now and next follow the clock", () => {
  const cells = buildEpgCells([program("a", 0, 60), program("b", 60, 60), program("c", 120, 60)], options);
  const { now, next } = epgNowNext(cells, DAY_START + 70 * MIN);
  assert.equal(now?.id, "b");
  assert.equal(next?.id, "c");
});

test("the Guide grid keeps drag scrolling with a native wheel and pinned rows", () => {
  const source = readFileSync(resolve(process.cwd(), "components/watch/GuideEpg.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "components/watch/GuideEpg.module.css"), "utf8");
  assert.match(source, /useDragScroll<HTMLDivElement>\(\{ wheel: "native" \}\)/);
  assert.match(css, /\.rulerRow \{[\s\S]{0,80}position: sticky;[\s\S]{0,20}top: 0;/);
  assert.match(css, /\.channel \{[\s\S]{0,80}position: sticky;[\s\S]{0,20}left: 0;/);
  // overflow: hidden would turn each cell into a scroll container and stop
  // titles from sticking to the visible edge.
  assert.match(css, /\.cell \{[\s\S]{0,300}overflow: clip;/);
});

test("the compact Guide and History appear on the home page and the 24/7 channel page", () => {
  const home = readFileSync(resolve(process.cwd(), "components/watch/WatchHome.tsx"), "utf8");
  const channel = readFileSync(resolve(process.cwd(), "components/watch/NetworkChannelPage.tsx"), "utf8");
  assert.match(home, /<GuideAndHistory>[\s\S]{0,120}<GuideNowStrip[\s\S]{0,160}<WatchHistoryPanel/);
  // One-page channel: the strip lives in the Guide section, the panel in History, on every mode.
  assert.match(channel, /id="schedule"[\s\S]*<GuideNowStrip network=/);
  assert.match(channel, /id="history"[\s\S]{0,200}<WatchHistoryPanel items=/);
  assert.doesNotMatch(channel, /<GuideAndHistory>/);
});
