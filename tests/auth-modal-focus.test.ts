import assert from "node:assert/strict";
import test from "node:test";
import { dialogTabBoundary, visibleDialogControls } from "../lib/auth/modal-focus";

test("responsive hidden showcase controls do not enter the dialog focus order", () => {
  const node = (rects: number, hiddenAncestor = false, tabIndex = 0) => ({
    tabIndex, getClientRects: () => Array(rects), closest: () => hiddenAncestor ? {} : null,
  }) as unknown as HTMLElement;
  const hiddenSlide = node(0);
  const inert = node(1, true);
  const decorative = node(1, false, -1);
  const input = node(1);
  const close = node(1);
  const dialog = { querySelectorAll: () => [hiddenSlide, inert, decorative, input, close] } as unknown as HTMLElement;
  assert.deepEqual(visibleDialogControls(dialog), [input, close]);
  assert.deepEqual(visibleDialogControls(null), []);
});

test("Tab wraps in both directions and recovers focus from outside the dialog", () => {
  const controls = ["email", "password", "submit", "close"];
  assert.equal(dialogTabBoundary(controls, "close", false), "email");
  assert.equal(dialogTabBoundary(controls, "email", true), "close");
  assert.equal(dialogTabBoundary(controls, "password", false), null);
  assert.equal(dialogTabBoundary(controls, "hidden-slide", false), "email");
  assert.equal(dialogTabBoundary(controls, null, true), "close");
  assert.equal(dialogTabBoundary([], null, false), null);
});
