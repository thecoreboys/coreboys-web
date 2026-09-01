import assert from "node:assert/strict";
import test from "node:test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config as middlewareConfig } from "../middleware";

function matches(pathname: string) {
  return unstable_doesMiddlewareMatch({
    config: middlewareConfig,
    url: `https://thecoreboys.com${pathname}`,
  });
}

test("middleware skips public media while retaining page, API, and worker protection", () => {
  for (const pathname of [
    "/special-message/app-screens/guide.png",
    "/members/marlon/portrait.jpg",
    "/fonts/Nord-Regular.ttf",
    "/audio/network-tunes/flock.mp3",
    "/brand/supporter/upgrade-signal-material-v1.webp",
  ]) {
    assert.equal(matches(pathname), false, pathname);
  }

  for (const pathname of ["/", "/api/twitch/live", "/admin", "/core-push-sw.js"]) {
    assert.equal(matches(pathname), true, pathname);
  }
});
