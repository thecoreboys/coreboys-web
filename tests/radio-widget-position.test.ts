import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RADIO_WIDGET_ANCHOR,
  anchorToPosition,
  clearRadioWidgetObstacles,
  parseRadioWidgetAnchor,
  snapRadioWidgetAnchor,
} from "../lib/watch/radio-widget-position";

// A 512x156 widget on a 1440x900 screen under a 72px header, 12px inset.
const bounds = { minX: 12, maxX: 1440 - 512 - 12, minY: 84, maxY: 900 - 156 - 12 };

test("the default anchor is the bottom-right corner", () => {
  assert.deepEqual(DEFAULT_RADIO_WIDGET_ANCHOR, { x: 1, y: 1 });
  assert.deepEqual(anchorToPosition(DEFAULT_RADIO_WIDGET_ANCHOR, bounds), { x: 916, y: 732 });
});

test("a release mid-screen snaps to the nearest edge, never staying in the middle", () => {
  const anchor = snapRadioWidgetAnchor({ x: 460, y: 300 }, bounds);
  // 448px from left, 456 from right, 216 from top, 432 from bottom: top edge.
  assert.equal(anchor.y, 0);
  assert.ok(anchor.x > 0 && anchor.x < 1);
  assert.deepEqual(anchorToPosition(anchor, bounds), { x: 460, y: 84 });
});

test("a release near a corner lands in the corner", () => {
  assert.deepEqual(snapRadioWidgetAnchor({ x: 860, y: 640 }, bounds), { x: 1, y: 1 });
  assert.deepEqual(snapRadioWidgetAnchor({ x: 40, y: 100 }, bounds), { x: 0, y: 0 });
  assert.deepEqual(snapRadioWidgetAnchor({ x: -300, y: 2000 }, bounds), { x: 0, y: 1 });
});

test("a release along a side edge keeps its height on that edge", () => {
  const anchor = snapRadioWidgetAnchor({ x: 900, y: 400 }, bounds);
  assert.equal(anchor.x, 1);
  assert.deepEqual(anchorToPosition(anchor, bounds), { x: 916, y: 400 });
});

test("anchors survive a resize as the same corner", () => {
  const small = { minX: 12, maxX: 1024 - 512 - 12, minY: 84, maxY: 768 - 156 - 12 };
  assert.deepEqual(anchorToPosition({ x: 1, y: 1 }, small), { x: 500, y: 600 });
});

test("the widget steps up off a bottom obstacle and down off a top one, staying on screen", () => {
  const size = { width: 512, height: 156 };
  const mini = { left: 800, top: 600, right: 1428, bottom: 888 };
  assert.deepEqual(clearRadioWidgetObstacles({ x: 916, y: 732 }, size, { x: 1, y: 1 }, [mini], bounds), { x: 916, y: 432 });
  const topMini = { left: 800, top: 84, right: 1428, bottom: 300 };
  assert.deepEqual(clearRadioWidgetObstacles({ x: 916, y: 84 }, size, { x: 1, y: 0 }, [topMini], bounds), { x: 916, y: 312 });
  const huge = { left: 0, top: 0, right: 1440, bottom: 900 };
  assert.deepEqual(clearRadioWidgetObstacles({ x: 916, y: 732 }, size, { x: 1, y: 1 }, [huge], bounds), { x: 916, y: 84 });
  assert.deepEqual(clearRadioWidgetObstacles({ x: 916, y: 732 }, size, { x: 1, y: 1 }, [{ left: 0, top: 600, right: 400, bottom: 888 }], bounds), { x: 916, y: 732 });
});

test("stored anchors must sit on an edge; old mid-screen data resets", () => {
  assert.deepEqual(parseRadioWidgetAnchor({ x: 1, y: 0.4 }), { x: 1, y: 0.4 });
  assert.equal(parseRadioWidgetAnchor({ x: 0.5, y: 0.5 }), null);
  assert.equal(parseRadioWidgetAnchor({ x: 640, y: 300 }), null);
  assert.equal(parseRadioWidgetAnchor(null), null);
  assert.equal(parseRadioWidgetAnchor({ x: "1", y: 1 }), null);
});
