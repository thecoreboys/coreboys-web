import assert from "node:assert/strict";
import test from "node:test";
import {
  THEATER_GUIDE_MAX_PROGRAM_WIDTH,
  THEATER_GUIDE_MIN_PROGRAM_WIDTH,
  theaterGuideProgramExpandedWidth,
  theaterGuideProgramWidth,
} from "../lib/watch/theater-guide-layout";

test("theater guide cards reserve readable room for artwork and title", () => {
  const width = theaterGuideProgramWidth({
    title: "The Full Reunion Stream With The Whole House",
    durationWidth: 18,
    hasArtwork: true,
  });

  assert.ok(width >= THEATER_GUIDE_MIN_PROGRAM_WIDTH);
  assert.ok(width >= 200, "artwork should leave usable title space beside it");
  assert.ok(width <= THEATER_GUIDE_MAX_PROGRAM_WIDTH);
});

test("focused theater guide cards can reveal more title copy without exceeding the lane cap", () => {
  const input = {
    title: "A deliberately long guide program title that should be easier to read before tuning in",
    durationWidth: 96,
    hasArtwork: true,
  };

  assert.ok(theaterGuideProgramExpandedWidth(input) >= theaterGuideProgramWidth(input));
  assert.ok(theaterGuideProgramExpandedWidth(input) <= THEATER_GUIDE_MAX_PROGRAM_WIDTH);
});
