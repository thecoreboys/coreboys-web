import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { cancelTheaterHandoff, isActiveTheaterDestination, isLeavingPlayerPage, resetTheaterHandoff } from "../lib/watch/theater-handoff";

const firstTitle = "kind=live&id=silky&ref=live-silky&title=Live+show";
afterEach(resetTheaterHandoff);

test("browser Back from a player page cannot enqueue an automatic Theater reopen", () => {
  for (const previousPath of ["/theater", "/shorts"]) {
    assert.equal(isLeavingPlayerPage(previousPath, "/channels/core"), true);
    assert.equal(isLeavingPlayerPage(previousPath, "/guide"), true);
  }
});

test("normal Tune in and navigation between full player surfaces remain eligible", () => {
  assert.equal(isLeavingPlayerPage("/channels/core", "/channels/core"), false);
  assert.equal(isLeavingPlayerPage("/", "/channels/core"), false);
  assert.equal(isLeavingPlayerPage("/theater", "/shorts"), false);
  assert.equal(isLeavingPlayerPage("/shorts", "/theater"), false);
});

test("Minimize or Close wins over a late handoff while the return navigation is pending", () => {
  const pendingLocation = { pathname: "/theater", search: `?${firstTitle}` };
  cancelTheaterHandoff(pendingLocation);
  assert.equal(isActiveTheaterDestination(pendingLocation, firstTitle), false);
  // Strict Mode can run the late effect again before the route commits.
  assert.equal(isActiveTheaterDestination(pendingLocation, firstTitle), false);
});

test("after returning to browsing, the same title can be opened intentionally again", () => {
  const location = { pathname: "/theater", search: `?${firstTitle}` };
  cancelTheaterHandoff(location);
  resetTheaterHandoff();
  assert.equal(isActiveTheaterDestination(location, firstTitle), true);
});

test("cancelling an earlier title does not block a different Theater destination", () => {
  cancelTheaterHandoff({ pathname: "/theater", search: firstTitle });
  const nextTitle = "kind=youtube&id=second&ref=yt-second";
  assert.equal(isActiveTheaterDestination({ pathname: "/theater", search: nextTitle }, nextTitle), true);
});

test("a late Theater handoff cannot reopen after Minimize or Close returned to browsing", () => {
  for (const pathname of ["/channels/core", "/", "/guide", "/multiview"]) {
    assert.equal(isActiveTheaterDestination({ pathname, search: `?${firstTitle}` }, firstTitle), false);
  }
});

test("a pending earlier title cannot replace a newer Theater destination", () => {
  assert.equal(isActiveTheaterDestination({ pathname: "/theater", search: "?kind=youtube&id=second&ref=yt-second" }, firstTitle), false);
});

test("direct links and reloads initialize the active Theater destination", () => {
  assert.equal(isActiveTheaterDestination({ pathname: "/theater", search: `?${firstTitle}` }, firstTitle), true);
  assert.equal(isActiveTheaterDestination({ pathname: "/theater/", search: "?title=Live%20show&ref=live-silky&id=silky&kind=live" }, firstTitle), true);
});

test("an unrelated route with a Theater prefix does not start playback", () => {
  assert.equal(isActiveTheaterDestination({ pathname: "/theater-other", search: `?${firstTitle}` }, firstTitle), false);
});
